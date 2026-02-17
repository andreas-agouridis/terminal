import { z } from "zod";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { groupBy, pipe, values } from "remeda";
import { lifetimeCronSubscriptionTable } from "./lifetime-cron.sql";
import {
  useTransaction,
  createTransaction,
  afterTx,
} from "../drizzle/transaction";
import { Actor } from "../actor";
import { createID } from "../util/id";
import { productTable, productVariantTable } from "../product/product.sql";
import { addressTable } from "../address/address.sql";
import { ErrorCodes, VisibleError } from "../error";
import { Order } from "../order/order";
import { Log } from "../util/log";
import { fn } from "../util/fn";
import { defineEvent } from "../event";
import { bus } from "sst/aws/bus";
import { Resource } from "sst";

export namespace LifetimeCron {
  const log = Log.create({ namespace: "lifetime-cron" });

  export const Event = {
    Created: defineEvent(
      "lifetime_cron_subscription.created",
      z.object({
        lifetimeCronSubscriptionID: z.string(),
        userID: z.string(),
      }),
    ),
    Cancelled: defineEvent(
      "lifetime_cron_subscription.cancelled",
      z.object({
        lifetimeCronSubscriptionID: z.string(),
        userID: z.string(),
      }),
    ),
  };

  export const Info = z.object({
    id: z.string(),
    productVariantID: z.string(),
    quantity: z.number().int().min(1),
    addressID: z.string(),
    next: z.date().optional(),
    created: z.coerce.date(),
  });

  export type Info = z.infer<typeof Info>;

  const CreateInput = z.object({
    productVariantID: z.string(),
    quantity: z.number().int().min(1),
    addressID: z.string(),
  });

  export type CreateInput = z.infer<typeof CreateInput>;

  export const create = fn(CreateInput, (input) =>
    useTransaction(async (tx) => {
      const actor = Actor.assert("system");
      const userID = actor.properties.userID;

      const variant = await tx
        .select({
          productName: productTable.name,
        })
        .from(productVariantTable)
        .innerJoin(
          productTable,
          eq(productVariantTable.productID, productTable.id),
        )
        .where(eq(productVariantTable.id, input.productVariantID))
        .then((rows) => rows[0]);

      if (!variant)
        throw new VisibleError(
          "validation",
          ErrorCodes.Validation.INVALID_PARAMETER,
          "Product variant not found",
        );

      if (variant.productName !== "cron")
        throw new VisibleError(
          "validation",
          ErrorCodes.Validation.INVALID_PARAMETER,
          "Product variant is not a cron product",
        );

      const address = await tx
        .select({ id: addressTable.id })
        .from(addressTable)
        .where(
          and(
            eq(addressTable.id, input.addressID),
            eq(addressTable.userID, userID),
          ),
        )
        .then((rows) => rows[0]);

      if (!address)
        throw new VisibleError(
          "validation",
          ErrorCodes.Validation.INVALID_PARAMETER,
          "Address not found",
        );

      const id = createID("subscription");
      await tx
        .insert(lifetimeCronSubscriptionTable)
        .values({
          id,
          timeNext: null,
          userID,
          productVariantID: input.productVariantID,
          quantity: input.quantity,
          addressID: input.addressID,
        })
        .onDuplicateKeyUpdate({
          set: {
            quantity: sql`VALUES(quantity)`,
            addressID: sql`VALUES(shipping_id)`,
            timeNext: null,
            timeDeleted: null,
          },
        });

      const row = await tx
        .select({ id: lifetimeCronSubscriptionTable.id })
        .from(lifetimeCronSubscriptionTable)
        .where(
          and(
            eq(lifetimeCronSubscriptionTable.userID, userID),
            eq(
              lifetimeCronSubscriptionTable.productVariantID,
              input.productVariantID,
            ),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]!);

      await afterTx(() =>
        bus.publish(Resource.Bus, Event.Created, {
          lifetimeCronSubscriptionID: row.id,
          userID,
        }),
      );

      return row.id;
    }),
  );

  export const cancel = fn(z.string(), (input) =>
    useTransaction(async (tx) => {
      Actor.assert("system");
      const response = await tx
        .update(lifetimeCronSubscriptionTable)
        .set({
          timeDeleted: sql`CURRENT_TIMESTAMP(3)`,
        })
        .where(
          and(
            eq(lifetimeCronSubscriptionTable.id, input),
            eq(lifetimeCronSubscriptionTable.userID, Actor.userID()),
            isNull(lifetimeCronSubscriptionTable.timeDeleted),
          ),
        );
      if (response.rowsAffected === 0) {
        throw new VisibleError(
          "not_found",
          ErrorCodes.NotFound.RESOURCE_NOT_FOUND,
          "Lifetime cron subscription not found",
        );
      }

      await afterTx(() =>
        bus.publish(Resource.Bus, Event.Cancelled, {
          lifetimeCronSubscriptionID: input,
          userID: Actor.userID(),
        }),
      );
    }),
  );

  export const fromID = fn(Info.shape.id, (id) =>
    useTransaction(async (tx) => {
      Actor.assert("system");
      const rows = await tx
        .select()
        .from(lifetimeCronSubscriptionTable)
        .where(
          and(
            eq(lifetimeCronSubscriptionTable.id, id),
            eq(lifetimeCronSubscriptionTable.userID, Actor.userID()),
          ),
        )
        .limit(1);
      return rows.map(serialize).at(0);
    }),
  );

  function serialize(
    input: typeof lifetimeCronSubscriptionTable.$inferSelect,
  ): z.infer<typeof Info> {
    return {
      id: input.id,
      productVariantID: input.productVariantID,
      quantity: input.quantity,
      addressID: input.addressID,
      next: input.timeNext || undefined,
      created: input.timeCreated,
    };
  }

  export async function process() {
    const subs = await useTransaction((tx) =>
      tx
        .select()
        .from(lifetimeCronSubscriptionTable)
        .where(
          and(
            isNotNull(lifetimeCronSubscriptionTable.timeNext),
            lt(
              lifetimeCronSubscriptionTable.timeNext,
              DateTime.now().toUTC().toJSDate(),
            ),
            isNull(lifetimeCronSubscriptionTable.timeDeleted),
          ),
        ),
    );

    log.info("processing", { subscriptions: subs.length });
    const grouped = pipe(
      subs,
      groupBy((s) => s.addressID),
      values(),
    );
    for (const group of grouped) {
      await Actor.provide(
        "system",
        {
          userID: group[0].userID,
        },
        async () => {
          await createTransaction(async (tx) => {
            const order = await Order.createComped({
              addressID: group[0].addressID,
              variants: Object.fromEntries(
                group.map(
                  (item) => [item.productVariantID, item.quantity] as const,
                ),
              ),
            }).catch((ex) => {
              log.error(ex as Error);
              return;
            });
            if (!order) return;

            for (const sub of group) {
              await tx
                .update(lifetimeCronSubscriptionTable)
                .set({
                  timeNext: null,
                })
                .where(eq(lifetimeCronSubscriptionTable.id, sub.id));
            }
          });
        },
      );
    }
  }
}
