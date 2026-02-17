import { Action, Layout, Page, ctx, io } from "@forgeapp/sdk";
import { DateTime } from "luxon";

import {
  and,
  count,
  eq,
  inArray,
  isNull,
  sql,
} from "@terminal/core/drizzle/index";
import { useTransaction } from "@terminal/core/drizzle/transaction";
import { addressTable } from "@terminal/core/address/address.sql";
import { Actor } from "@terminal/core/actor";
import { productTable, productVariantTable } from "@terminal/core/product/product.sql";
import { Subscription } from "@terminal/core/subscription/subscription";
import { subscriptionTable } from "@terminal/core/subscription/subscription.sql";
import { lifetimeCronSubscriptionTable } from "@terminal/core/subscription/lifetime-cron.sql";
import { LifetimeCron } from "@terminal/core/subscription/lifetime-cron";
import { userTable } from "@terminal/core/user/user.sql";

import * as formatters from "../formatters";
import * as queries from "../queries";

const productFilter = eq(productTable.name, "cron");

const cancel = new Action({
  name: "Cancel Subscription",
  unlisted: true,
  handler: async () => {
    const subscriptionId = String(ctx.params.id);

    const confirmed = await io.confirm(`Are you sure you want to cancel this subscription?`);
    if (confirmed) {
      const subscription = await useTransaction(async (tx) =>
        tx
          .select({ userID: subscriptionTable.userID })
          .from(subscriptionTable)
          .where(eq(subscriptionTable.id, subscriptionId))
          .limit(1)
          .then((rows) => rows[0]),
      );

      if (subscription) {
        await Actor.provide("system", { userID: subscription.userID }, async () => {
          await Subscription.cancel(subscriptionId);
        });
      }
    }

    await ctx.redirect({ route: "subsCron" });
  },
});

const cancelLifetime = new Action({
  name: "Cancel Lifetime Cron",
  unlisted: true,
  handler: async () => {
    const lifetimeId = String(ctx.params.id);

    const confirmed = await io.confirm(
      `Are you sure you want to cancel this lifetime cron subscription?`,
    );
    if (confirmed) {
      const subscription = await useTransaction(async (tx) =>
        tx
          .select({ userID: lifetimeCronSubscriptionTable.userID })
          .from(lifetimeCronSubscriptionTable)
          .where(eq(lifetimeCronSubscriptionTable.id, lifetimeId))
          .limit(1)
          .then((rows) => rows[0]),
      );

      if (subscription) {
        await Actor.provide("system", { userID: subscription.userID }, async () => {
          await LifetimeCron.cancel(lifetimeId);
        });
      }
    }

    await ctx.redirect({ route: "subsCron" });
  },
});

const addLifetimeCron = new Action({
  name: "Add Lifetime Cron",
  handler: async () => {
    const lookup = await io.input.text("User ID or email", {
      placeholder: "usr_... or user@example.com",
    });

    const user =
      lookup.includes("@")
        ? await queries.getUserByEmail(lookup.trim())
        : await queries.getUser(lookup.trim());

    if (!user) {
      throw new Error("User not found");
    }

    const addressesResult = await queries.getUserAddresses(user.id, {
      offset: 0,
      pageSize: 100,
    });
    const addresses = addressesResult.data;
    if (addresses.length === 0) {
      throw new Error("User has no saved addresses. Please add an address first.");
    }

    const addressChoice = await io.select.single("Shipping Address", {
      options: addresses.map((addr) => ({
        label: formatters.formatAddressFull(addr.address),
        value: addr.id,
      })),
    });

    const variants = await queries.getCronProductVariants();
    if (variants.length === 0) {
      throw new Error("No cron product variants found");
    }

    const variantChoice = await io.select.single("Cron Variant", {
      options: variants.map((variant) => ({
        label: `${variant.productName} - ${variant.name}`,
        value: variant.id,
      })),
    });

    const quantity = await io.input.number("Quantity", {
      defaultValue: 1,
    });

    if (quantity < 1) {
      throw new Error("Quantity must be at least 1");
    }

    const confirmed = await io.confirm("Create lifetime cron subscription?", {
      helpText: "This grants cron forever with no charges and no card on file.",
    });

    if (!confirmed) {
      await ctx.redirect({ route: "subsCron" });
      return;
    }

    await Actor.provide("system", { userID: user.id }, async () => {
      await LifetimeCron.create({
        addressID: addressChoice.value,
        productVariantID: variantChoice.value,
        quantity,
      });
    });

    await ctx.redirect({ route: "subsCron" });
  },
});

const scheduleCronNowExecute = new Action({
  name: "Execute Schedule + Process",
  unlisted: true,
  handler: async () => {
    const scheduledAt = DateTime.now().toUTC().startOf("day").toJSDate();

    const confirmed = await io.confirm(
      "Execute scheduling and run the subscription processor now?",
      {
        helpText:
          "This will update active cron subscriptions where next date is NULL to 00:00 UTC today, then run Subscription.process() to create orders. After processing, cron subscriptions return to NULL next date (fixed schedule).",
      },
    );
    if (!confirmed) {
      await ctx.redirect({ route: "subsCron/scheduleCronNow" });
      return;
    }

    const updatedCounts = await useTransaction(async (tx) => {
      const rows = await tx
        .select({ id: subscriptionTable.id })
        .from(subscriptionTable)
        .innerJoin(
          productVariantTable,
          eq(subscriptionTable.productVariantID, productVariantTable.id),
        )
        .innerJoin(
          productTable,
          eq(productVariantTable.productID, productTable.id),
        )
        .where(
          and(
            isNull(subscriptionTable.timeDeleted),
            isNull(subscriptionTable.timeNext),
            productFilter,
          ),
        );

      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        await tx
          .update(subscriptionTable)
          .set({ timeNext: scheduledAt })
          .where(inArray(subscriptionTable.id, ids));
      }

      const lifetimeRows = await tx
        .select({ id: lifetimeCronSubscriptionTable.id })
        .from(lifetimeCronSubscriptionTable)
        .innerJoin(
          productVariantTable,
          eq(lifetimeCronSubscriptionTable.productVariantID, productVariantTable.id),
        )
        .innerJoin(
          productTable,
          eq(productVariantTable.productID, productTable.id),
        )
        .where(
          and(
            isNull(lifetimeCronSubscriptionTable.timeDeleted),
            isNull(lifetimeCronSubscriptionTable.timeNext),
            productFilter,
          ),
        );

      const lifetimeIds = lifetimeRows.map((r) => r.id);
      if (lifetimeIds.length > 0) {
        await tx
          .update(lifetimeCronSubscriptionTable)
          .set({ timeNext: scheduledAt })
          .where(inArray(lifetimeCronSubscriptionTable.id, lifetimeIds));
      }

      return {
        paid: ids.length,
        lifetime: lifetimeIds.length,
      };
    });

    await io.display.metadata("Cron subscriptions scheduled", {
      layout: "list",
      data: [
        { label: "Scheduled time (UTC)", value: scheduledAt.toISOString() },
        { label: "Paid subscriptions updated", value: updatedCounts.paid },
        { label: "Lifetime subscriptions updated", value: updatedCounts.lifetime },
      ],
    });

    await Subscription.process();
    await LifetimeCron.process();

    await ctx.redirect({ route: "subsCron" });
  },
});

const scheduleCronNow = new Page({
  name: "Schedule Cron (Preview)",
  unlisted: true,
  handler: async () => {
    const scheduledAt = DateTime.now().toUTC().startOf("day").toJSDate();

    const totals = await useTransaction(async (tx) => {
      const paid = await tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(subscriptionTable)
        .innerJoin(userTable, eq(subscriptionTable.userID, userTable.id))
        .innerJoin(addressTable, eq(subscriptionTable.addressID, addressTable.id))
        .innerJoin(
          productVariantTable,
          eq(subscriptionTable.productVariantID, productVariantTable.id),
        )
        .innerJoin(productTable, eq(productVariantTable.productID, productTable.id))
        .where(
          and(
            isNull(subscriptionTable.timeDeleted),
            isNull(subscriptionTable.timeNext),
            productFilter,
          ),
        );

      const lifetime = await tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(lifetimeCronSubscriptionTable)
        .innerJoin(userTable, eq(lifetimeCronSubscriptionTable.userID, userTable.id))
        .innerJoin(
          addressTable,
          eq(lifetimeCronSubscriptionTable.addressID, addressTable.id),
        )
        .innerJoin(
          productVariantTable,
          eq(lifetimeCronSubscriptionTable.productVariantID, productVariantTable.id),
        )
        .innerJoin(productTable, eq(productVariantTable.productID, productTable.id))
        .where(
          and(
            isNull(lifetimeCronSubscriptionTable.timeDeleted),
            isNull(lifetimeCronSubscriptionTable.timeNext),
            productFilter,
          ),
        );

      return {
        paid: Number(paid[0]?.count ?? 0),
        lifetime: Number(lifetime[0]?.count ?? 0),
      };
    });

    return new Layout({
      title: "Schedule Cron (Preview)",
      menuItems: [
        {
          label: "Execute Schedule + Process",
          route: "subsCron/scheduleCronNow/execute",
        },
      ],
      children: [
        io.display.heading("Subscriptions to update", { level: 3 }),
        io.display.metadata("", {
          layout: "list",
          data: [
            {
              label: "Scheduled time (UTC)",
              value: scheduledAt.toISOString(),
            },
            {
              label: "Matching subscriptions (paid)",
              value: totals.paid.toString(),
            },
            {
              label: "Matching subscriptions (lifetime)",
              value: totals.lifetime.toString(),
            },
          ],
        }),
        io.display.table("Cron subscriptions with NULL next date", {
          getData: async (input) => {
            const queryTerm = input.queryTerm?.trim() || undefined;
            return queries.getCronSchedulePreview(
              {
                offset: input.offset,
                pageSize: input.pageSize,
              },
              productFilter,
              queryTerm,
            );
          },
          columns: [
            "id",
            "name",
            "email",
            "product",
            "type",
            {
              label: "price",
              renderCell: (row: any) => ({
                label: formatters.formatCurrency(row.price),
              }),
            },
            {
              label: "address",
              renderCell: (row: any) => ({
                label: formatters.formatAddressShort(row.address),
              }),
            },
            "created",
            {
              label: "schedule",
              renderCell: (row: any) => ({
                label: formatters.formatSchedule(row.schedule),
              }),
            },
            "next",
          ],
          isSortable: false,
        }),
      ],
    });
  },
  routes: {
    execute: scheduleCronNowExecute,
  },
});

export const CronSubs = new Page({
  name: "Subs: Cron",
  handler: async () => {
    const totals = await useTransaction(async (tx) => {
      const paid = await tx
        .select({ count: count(subscriptionTable.id) })
        .from(subscriptionTable)
        .innerJoin(
          productVariantTable,
          eq(subscriptionTable.productVariantID, productVariantTable.id),
        )
        .innerJoin(productTable, eq(productVariantTable.productID, productTable.id))
        .where(and(isNull(subscriptionTable.timeDeleted), productFilter));

      const lifetime = await tx
        .select({ count: count(lifetimeCronSubscriptionTable.id) })
        .from(lifetimeCronSubscriptionTable)
        .innerJoin(
          productVariantTable,
          eq(lifetimeCronSubscriptionTable.productVariantID, productVariantTable.id),
        )
        .innerJoin(productTable, eq(productVariantTable.productID, productTable.id))
        .where(and(isNull(lifetimeCronSubscriptionTable.timeDeleted), productFilter));

      return {
        paid: Number(paid[0]?.count ?? 0),
        lifetime: Number(lifetime[0]?.count ?? 0),
      };
    });

    return new Layout({
      title: "Subscription",
      menuItems: [
        {
          label: "Schedule Cron (midnight UTC today) + Process",
          route: "subsCron/scheduleCronNow",
        },
        {
          label: "Add Lifetime Cron",
          route: "subsCron/addLifetime",
        },
      ],
      children: [
        io.display.heading(
          "Active Subscriptions: " +
            (totals.paid + totals.lifetime).toString(),
          {
            level: 3,
          },
        ),
        io.display.table("Subscriptions", {
          getData: async (input) => {
            const queryTerm = input.queryTerm?.trim() || undefined;
            return queries.getCronSubscriptionsMerged(
              {
                offset: input.offset,
                pageSize: input.pageSize,
              },
              productFilter,
              queryTerm,
            );
          },
          rowMenuItems: (row: any) => [
            row.type === "lifetime"
              ? {
                  label: "Cancel Lifetime",
                  route: "subsCron/cancelLifetime",
                  params: { id: row.id },
                }
              : {
                  label: "Cancel",
                  route: "subsCron/cancel",
                  params: { id: row.id },
                },
          ],
          columns: [
            "id",
            "name",
            "email",
            "product",
            "type",
            {
              label: "price",
              renderCell: (row: any) => ({
                label: formatters.formatCurrency(row.price),
              }),
            },
            {
              label: "address",
              renderCell: (row: any) => ({
                label: formatters.formatAddressShort(row.address),
              }),
            },
            "created",
            {
              label: "schedule",
              renderCell: (row: any) => ({
                label: formatters.formatSchedule(row.schedule),
              }),
            },
            "next",
          ],
          isSortable: false,
        }),
      ],
    });
  },
  routes: {
    cancel,
    cancelLifetime,
    addLifetime: addLifetimeCron,
    scheduleCronNow,
  },
});
