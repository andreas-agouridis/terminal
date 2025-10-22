import { Layout, Page, io } from "@forgeapp/sdk";
import { useTransaction } from "@terminal/core/drizzle/transaction";
import { and, count, desc, eq, isNull } from "@terminal/core/drizzle/index";
import { subscriptionTable } from "@terminal/core/subscription/subscription.sql";
import { userTable } from "@terminal/core/user/user.sql";
import { addressTable } from "@terminal/core/address/address.sql";
import {
  productTable,
  productVariantTable,
} from "@terminal/core/product/product.sql";

export const CronSubs = new Page({
  name: "Subs: Cron",
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
				  eq(productTable.name, "cron")
				))
                .orderBy(desc(subscriptionTable.id))
                .offset(input.offset)
                .limit(input.pageSize),
            }));
          },
          rowMenuItems: (row) =>
            [
              // row.label && {
              //   label: "Label",
              //   url: row.label!,
              // },
              // row.tracking && {
              //   label: "Tracking",
              //   url: row.tracking!,
              // },
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
  routes: {},
});
