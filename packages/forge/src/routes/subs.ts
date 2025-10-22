import { Action, Layout, Page, ctx, io } from "@forgeapp/sdk";
import { useTransaction } from "@terminal/core/drizzle/transaction";
import { and, count, desc, eq, isNull, like, notLike, or, sql } from "@terminal/core/drizzle/index";
import { subscriptionTable } from "@terminal/core/subscription/subscription.sql";
import { Subscription } from "@terminal/core/subscription/subscription";
import { userTable } from "@terminal/core/user/user.sql";
import { Actor } from "@terminal/core/actor";
import { addressTable } from "@terminal/core/address/address.sql";
import {
  productTable,
  productVariantTable,
} from "@terminal/core/product/product.sql";

export const Subs = new Page({
  name: "Subs: Coffee",
  handler: async () => {
    const totals = await useTransaction((tx) =>
      tx
        .select({ count: count(subscriptionTable.id) })
        .from(subscriptionTable)
        .where(and(isNull(subscriptionTable.timeDeleted))),
    );

    return new Layout({
      title: "Subscription",
      menuItems: [],
      children: [
        io.display.heading(
          "Active Subscriptions: " + totals[0]?.count?.toString(),
          {
            level: 3,
          },
        ),
        io.display.table("Subscriptions", {
          getData: async (input) => {
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
                .innerJoin(
                  userTable,
                  eq(subscriptionTable.userID, userTable.id),
                )
                .innerJoin(
                  addressTable,
                  eq(subscriptionTable.addressID, addressTable.id),
                )
                .innerJoin(
                  productVariantTable,
                  eq(
                    subscriptionTable.productVariantID,
                    productVariantTable.id,
                  ),
                )
                .innerJoin(
                  productTable,
                  eq(productVariantTable.productID, productTable.id),
                )
                .where(and(
				  isNull(subscriptionTable.timeDeleted),
				  notLike(productTable.name, "cron"),
				  input.queryTerm 
					? or(
					    like(productTable.name, "%" + input.queryTerm + "%"),
						like(userTable.email, "%" + input.queryTerm + "%"),
						like(userTable.name, "%" + input.queryTerm + "%"),
					  )
					: sql`true`
				))
                .orderBy(desc(subscriptionTable.id))
                .offset(input.offset)
                .limit(input.pageSize),
            }));
          },
          rowMenuItems: (row) =>
            [
              {
                label: "Cancel",
                route: "subsCoffee/cancel",
                params: {
                  id: row.id,
                },
              },
            ].filter(Boolean) as any,
          columns: [
            "id",
            "name",
            "email",
            "product",
            {
              label: "price",
              renderCell: (row) => ({
                label: `$${(row.price / 100).toFixed(2)}`,
              }),
            },
            {
              label: "address",
              renderCell: (row) => ({
                label:
                  row.address!.city +
                  ", " +
                  row.address!.province +
                  ", " +
                  row.address!.country,
              }),
            },
            "created",
            {
              label: "schedule",
              renderCell: (row) => ({
                label:
                  row.schedule?.type === "weekly"
                    ? `every ${row.schedule?.interval} weeks`
                    : row.schedule?.type,
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
    cancel: new Action({
      name: "Cancel Subscription",
      unlisted: true,
      handler: async () => {
        const subscriptionId = String(ctx.params.id);
        
        const confirmed = await io.confirm(
          `Are you sure you want to cancel this subscription?`
        );
        
        if (confirmed) {
          // Get subscription to find userID
          const subscription = await useTransaction(async (tx) => 
            tx
              .select({ userID: subscriptionTable.userID })
              .from(subscriptionTable)
              .where(eq(subscriptionTable.id, subscriptionId))
              .limit(1)
              .then(rows => rows[0])
          );
          
          if (subscription) {
            await Actor.provide("system", { userID: subscription.userID }, async () => {
              await Subscription.cancel(subscriptionId);
            });
          }
        }
        
        await ctx.redirect({
          route: "subsCoffee",
        });
      },
    }),
  },
});
