import { Action, Layout, Page, ctx, io } from "@forgeapp/sdk";
import { DateTime } from "luxon";

import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  or,
  sql,
} from "@terminal/core/drizzle/index";
import { useTransaction } from "@terminal/core/drizzle/transaction";
import { addressTable } from "@terminal/core/address/address.sql";
import { Actor } from "@terminal/core/actor";
import { productTable, productVariantTable } from "@terminal/core/product/product.sql";
import { Subscription } from "@terminal/core/subscription/subscription";
import { subscriptionTable } from "@terminal/core/subscription/subscription.sql";
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

    const updatedCount = await useTransaction(async (tx) => {
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
      if (ids.length === 0) return 0;

      await tx
        .update(subscriptionTable)
        .set({ timeNext: scheduledAt })
        .where(inArray(subscriptionTable.id, ids));

      return ids.length;
    });

    await io.display.metadata("Cron subscriptions scheduled", {
      layout: "list",
      data: [
        { label: "Scheduled time (UTC)", value: scheduledAt.toISOString() },
        { label: "Subscriptions updated", value: updatedCount },
      ],
    });

    await Subscription.process();

    await ctx.redirect({ route: "subsCron" });
  },
});

const scheduleCronNow = new Page({
  name: "Schedule Cron (Preview)",
  unlisted: true,
  handler: async () => {
    const scheduledAt = DateTime.now().toUTC().startOf("day").toJSDate();

    const totals = await useTransaction((tx) =>
      tx
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
        ),
    );

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
              label: "Matching subscriptions",
              value: totals[0]?.count?.toString() ?? "0",
            },
          ],
        }),
        io.display.table("Cron subscriptions with NULL next date", {
          getData: async (input) => {
            const queryTerm = input.queryTerm?.trim() || undefined;
            return useTransaction(async (tx) => ({
              data: await tx
                .select({
                  id: subscriptionTable.id,
                  name: userTable.name,
                  email: userTable.email,
                  address: addressTable.address,
                  product: productTable.name,
                  price: subscriptionTable.price,
                  created: subscriptionTable.timeCreated,
                  schedule: subscriptionTable.schedule,
                  next: subscriptionTable.timeNext,
                })
                .from(subscriptionTable)
                .innerJoin(userTable, eq(subscriptionTable.userID, userTable.id))
                .innerJoin(addressTable, eq(subscriptionTable.addressID, addressTable.id))
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
                    queryTerm
                      ? or(
                          like(productTable.name, "%" + queryTerm + "%"),
                          like(userTable.email, "%" + queryTerm + "%"),
                          like(userTable.name, "%" + queryTerm + "%"),
                        )
                      : sql`true`,
                  ),
                )
                .orderBy(desc(subscriptionTable.id))
                .offset(input.offset)
                .limit(input.pageSize),
            }));
          },
          columns: [
            "id",
            "name",
            "email",
            "product",
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
    const totals = await useTransaction((tx) =>
      tx
        .select({ count: count(subscriptionTable.id) })
        .from(subscriptionTable)
        .innerJoin(
          productVariantTable,
          eq(subscriptionTable.productVariantID, productVariantTable.id),
        )
        .innerJoin(productTable, eq(productVariantTable.productID, productTable.id))
        .where(and(isNull(subscriptionTable.timeDeleted), productFilter)),
    );

    return new Layout({
      title: "Subscription",
      menuItems: [
        {
          label: "Schedule Cron (midnight UTC today) + Process",
          route: "subsCron/scheduleCronNow",
        },
      ],
      children: [
        io.display.heading("Active Subscriptions: " + totals[0]?.count?.toString(), {
          level: 3,
        }),
        io.display.table("Subscriptions", {
          getData: async (input) => {
            const queryTerm = input.queryTerm?.trim() || undefined;
            return queries.getAllSubscriptions(
              {
                offset: input.offset,
                pageSize: input.pageSize,
              },
              productFilter,
              queryTerm,
            );
          },
          rowMenuItems: (row: any) => [
            {
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
    scheduleCronNow,
  },
});
