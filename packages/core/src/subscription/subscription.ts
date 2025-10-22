import { z } from "zod";
import { isNotNull, isNull, lt, and, eq } from "drizzle-orm";
import { SubscriptionSchedule, subscriptionTable } from "./subscription.sql";
import {
  useTransaction,
  afterTx,
  createTransaction,
} from "../drizzle/transaction";
import { sql } from "drizzle-orm";
import { Actor } from "../actor";
import { createID } from "../util/id";
import { fn } from "../util/fn";
import { productTable, productVariantTable } from "../product/product.sql";
import { Common } from "../common";
import { Examples } from "../examples";
import { DateTime } from "luxon";
import { Order } from "../order/order";
import { orderItemTable } from "../order/order.sql";
import { groupBy, pipe, values } from "remeda";
import { ErrorCodes, VisibleError } from "../error";
import { Log } from "../util/log";
import { defineEvent } from "../event";
import { bus } from "sst/aws/bus";
import { Resource } from "sst";
import { Template } from "../email/template";

export namespace Subscription {
  const log = Log.create({ namespace: "subscription" });
  export const Info = z
    .object({
      id: z.string().openapi({
        description: Common.IdDescription,
        example: Examples.Subscription.id,
      }),
      productVariantID: z.string().openapi({
        description: "ID of the product variant being subscribed to.",
        example: Examples.Subscription.productVariantID,
      }),
      price: z.number().int().openapi({
        description: "Price of the subscription in cents (USD).",
        example: Examples.Subscription.price,
      }),
      quantity: z.number().int().openapi({
        description: "Quantity of the subscription.",
        example: Examples.Subscription.quantity,
      }),
      addressID: z.string().openapi({
        description: "ID of the shipping address used for the subscription.",
        example: Examples.Subscription.addressID,
      }),
      cardID: z.string().openapi({
        description: "ID of the card used for the subscription.",
        example: Examples.Subscription.cardID,
      }),
      schedule: SubscriptionSchedule.optional().openapi({
        description: "Schedule of the subscription.",
        example: Examples.Subscription.schedule,
      }),
      next: z.date().optional().openapi({
        description: "Next shipment and billing date for the subscription.",
        example: Examples.Subscription.next,
      }),
      created: z.coerce.date().openapi({
        description: "Date the subscription was created.",
        example: Examples.Subscription.created,
      }),
    })
    .openapi({
      ref: "Subscription",
      description: "Subscription to a Terminal shop product.",
      example: Examples.Subscription,
    });

  export type Info = z.infer<typeof Info>;

  export const Event = {
    Created: defineEvent(
      "subscription.created",
      z.object({
        subscriptionID: Info.shape.id,
      }),
    ),
    Updated: defineEvent(
      "subscription.updated",
      z.object({
        subscriptionID: Info.shape.id,
      }),
    ),
  };

  export const list = () =>
    useTransaction(async (tx) =>
      tx
        .select()
        .from(subscriptionTable)
        .where(eq(subscriptionTable.userID, Actor.userID()))
        .then((rows) => rows.map(serialize)),
    );

  export const create = fn(
    Info.omit({ id: true, created: true, price: true }),
    async (input) =>
      useTransaction(async (tx) => {
        const id = createID("subscription");
        const productVariant = await tx
          .select({
            subscription: productTable.subscription,
            price: productVariantTable.price,
          })
          .from(productVariantTable)
          .innerJoin(
            productTable,
            eq(productVariantTable.productID, productTable.id),
          )
          .where(eq(productVariantTable.id, input.productVariantID))
          .then((rows) => rows[0]);
        if (!productVariant)
          throw new VisibleError(
            "validation",
            ErrorCodes.Validation.INVALID_PARAMETER,
            "Product variant not found",
          );

        input.schedule =
          productVariant.subscription === "required"
            ? { type: "fixed" }
            : input.schedule;
        if (!input.schedule)
          throw new VisibleError(
            "validation",
            ErrorCodes.Validation.INVALID_PARAMETER,
            "Schedule for subscription required",
          );
        await tx
          .insert(subscriptionTable)
          .values({
            id,
            timeNext: input.schedule
              ? next({
                  schedule: input.schedule,
                  last: new Date(),
                })
              : undefined,
            userID: Actor.userID(),
            productVariantID: input.productVariantID,
            price: productVariant.price,
            quantity: input.quantity,
            addressID: input.addressID,
            cardID: input.cardID,
            schedule: input.schedule,
          })
          .onDuplicateKeyUpdate({
            set: {
              quantity: sql`VALUES(quantity)`,
              addressID: sql`VALUES(shipping_id)`,
              cardID: sql`VALUES(card_id)`,
              schedule: sql`VALUES(schedule)`,
              timeDeleted: null,
            },
          });
        const subscription = await tx
          .select({
            id: subscriptionTable.id,
          })
          .from(subscriptionTable)
          .where(
            and(
              eq(subscriptionTable.userID, Actor.userID()),
              eq(subscriptionTable.productVariantID, input.productVariantID),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]!);

        await afterTx(() =>
          bus.publish(Resource.Bus, Event.Created, {
            subscriptionID: subscription.id,
          }),
        );

        return subscription.id;
      }),
  );

  export const remove = fn(z.string(), (input) =>
    useTransaction(async (tx) => {
      const response = await tx
        .delete(subscriptionTable)
        .where(
          and(
            eq(subscriptionTable.id, input),
            eq(subscriptionTable.userID, Actor.userID()),
          ),
        );
      if (response.rowsAffected === 0) {
        throw new VisibleError(
          "not_found",
          ErrorCodes.NotFound.RESOURCE_NOT_FOUND,
          "Subscription not found",
        );
      }
    }),
  );

  export const cancel = fn(z.string(), (input) =>
    useTransaction(async (tx) => {
      const response = await tx
        .update(subscriptionTable)
        .set({
          timeDeleted: sql`CURRENT_TIMESTAMP(3)`,
        })
        .where(
          and(
            eq(subscriptionTable.id, input),
            eq(subscriptionTable.userID, Actor.userID()),
            isNull(subscriptionTable.timeDeleted),
          ),
        );
      if (response.rowsAffected === 0) {
        throw new VisibleError(
          "not_found",
          ErrorCodes.NotFound.RESOURCE_NOT_FOUND,
          "Active subscription not found",
        );
      }
    }),
  );

  export const fromID = fn(Info.shape.id, (id) =>
    useTransaction(async (tx) => {
      const rows = await tx
        .select()
        .from(subscriptionTable)
        .where(
          and(
            eq(subscriptionTable.id, id),
            eq(subscriptionTable.userID, Actor.userID()),
          ),
        )
        .limit(1);
      return rows.map(serialize).at(0);
    }),
  );

  export const UpdateInput = z
    .object({
      id: Info.shape.id,
      cardID: Info.shape.cardID.optional(),
      addressID: Info.shape.addressID.optional(),
      schedule: SubscriptionSchedule.optional(),
    })
    .openapi({
      ref: "SubscriptionUpdate",
      description: "Input for updating a subscription",
    });

  export type UpdateInput = z.infer<typeof UpdateInput>;

  export const update = fn(UpdateInput, async (input) =>
    useTransaction(async (tx) => {
      // Check that subscription exists and belongs to the user
      const subscription = await tx
        .select({
          id: subscriptionTable.id,
          productVariantID: subscriptionTable.productVariantID,
          timeNext: subscriptionTable.timeNext,
          schedule: subscriptionTable.schedule,
        })
        .from(subscriptionTable)
        .where(
          and(
            eq(subscriptionTable.id, input.id),
            eq(subscriptionTable.userID, Actor.userID()),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!subscription) {
        throw new VisibleError(
          "not_found",
          ErrorCodes.NotFound.RESOURCE_NOT_FOUND,
          "Subscription not found",
        );
      }

      // Build update object with only provided fields
      const updateData: Record<string, any> = {};

      if (input.cardID !== undefined) {
        updateData.cardID = input.cardID;
      }

      if (input.addressID !== undefined) {
        updateData.addressID = input.addressID;
      }

      if (input.schedule !== undefined) {
        updateData.schedule = input.schedule;

        // If schedule changes, recalculate next shipment date
        updateData.timeNext = next({
          schedule: input.schedule,
          last: subscription.timeNext || new Date(),
        });
      }

      // Only run update if there are fields to update
      if (Object.keys(updateData).length > 0) {
        await tx
          .update(subscriptionTable)
          .set(updateData)
          .where(
            and(
              eq(subscriptionTable.id, input.id),
              eq(subscriptionTable.userID, Actor.userID()),
            ),
          );

        await afterTx(() =>
          bus.publish(Resource.Bus, Event.Updated, {
            subscriptionID: subscription.id,
          }),
        );
      }

      return true;
    }),
  );

  function serialize(
    input: typeof subscriptionTable.$inferSelect,
  ): z.infer<typeof Info> {
    return {
      id: input.id,
      cardID: input.cardID,
      productVariantID: input.productVariantID,
      quantity: input.quantity,
      price: input.price,
      addressID: input.addressID,
      next: input.timeNext || undefined,
      schedule: input.schedule || undefined,
      created: input.timeCreated,
    };
  }

  export const next = fn(
    z.object({
      schedule: SubscriptionSchedule,
      last: z.date(),
    }),
    (input) => {
      if (input.schedule.type === "fixed") return null;
      return DateTime.fromJSDate(input.last)
        .toUTC()
        .startOf("week")
        .plus({ weeks: input.schedule.interval })
        .toJSDate();
    },
  );

  export async function process() {
    const subs = await useTransaction((tx) =>
      tx
        .select()
        .from(subscriptionTable)
        .where(
          and(
            isNotNull(subscriptionTable.timeNext),
            lt(subscriptionTable.timeNext, DateTime.now().toUTC().toJSDate()),
            isNull(subscriptionTable.timeDeleted),
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
          log.info("creating order");
          await createTransaction(async (tx) => {
            const order = await Order.create({
              addressID: group[0].addressID,
              cardID: group[0].cardID,
              variants: Object.fromEntries(
                group.map(
                  (item) => [item.productVariantID, item.quantity] as const,
                ),
              ),
              prices: Object.fromEntries(
                group.map(
                  (item) => [item.productVariantID, item.price] as const,
                ),
              ),
            }).catch(async (ex) => {
              log.error(ex);
              for (const sub of group) {
                await afterTx(() => Template.sendSubscriptionFailed(sub.id));
              }
              return;
            });
            if (!order) return;

            // Update order items with subscription IDs
            for (const sub of group) {
              await tx
                .update(orderItemTable)
                .set({
                  subscriptionID: sub.id,
                })
                .where(
                  and(
                    eq(orderItemTable.orderID, order),
                    eq(orderItemTable.productVariantID, sub.productVariantID),
                  ),
                );
            }

            for (const sub of group) {
              const n = next({
                schedule: sub.schedule!,
                last: sub.timeNext || new Date(),
              });

              await tx
                .update(subscriptionTable)
                .set({
                  timeNext: n,
                })
                .where(eq(subscriptionTable.id, sub.id));
            }
          });
        },
      );
    }
  }
}
