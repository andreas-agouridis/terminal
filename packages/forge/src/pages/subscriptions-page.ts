import { Action, Layout, Page, ctx, io } from "@forgeapp/sdk";
import { useTransaction } from "@terminal/core/drizzle/transaction";
import { count, eq, SQL, and, isNull } from "@terminal/core/drizzle/index";
import { subscriptionTable } from "@terminal/core/subscription/subscription.sql";
import { Subscription } from "@terminal/core/subscription/subscription";
import { Actor } from "@terminal/core/actor";
import { productTable, productVariantTable } from "@terminal/core/product/product.sql";
import * as queries from "../queries";
import * as formatters from "../formatters";

type SubscriptionRow = {
  id: string;
  name: string | null;
  email: string | null;
  address: any;
  product: string | null;
  price: number;
  created: Date | null;
  schedule: any;
  next: Date | null;
};

type SubscriptionPageConfig = {
  name: string;
  productFilter: SQL;
  enableSearch?: boolean;
  getRowMenuItems?: (row: SubscriptionRow) => any[];
  routes?: Record<string, Action>;
  redirectRoute?: string;
};

export function createSubscriptionsPage(config: SubscriptionPageConfig) {
  const {
    name,
    productFilter,
    enableSearch = false,
    getRowMenuItems,
    routes = {},
    redirectRoute,
  } = config;

  const allRoutes: Record<string, Action> = { ...routes };

  if (redirectRoute) {
    allRoutes.cancel = new Action({
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
          route: redirectRoute,
        });
      },
    });
  }

  return new Page({
    name,
    handler: async () => {
      const totals = await useTransaction((tx) =>
        tx
          .select({ count: count(subscriptionTable.id) })
          .from(subscriptionTable)
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
          .where(
            and(
              isNull(subscriptionTable.timeDeleted),
              productFilter,
            ),
          ),
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
              const queryTerm = enableSearch ? input.queryTerm?.trim() : undefined;
              return queries.getAllSubscriptions(
                {
                  offset: input.offset,
                  pageSize: input.pageSize,
                },
                productFilter,
                queryTerm,
              );
            },
            rowMenuItems: getRowMenuItems || (() => []),
            columns: [
              "id",
              "name",
              "email",
              "product",
              {
                label: "price",
                renderCell: (row) => ({
                  label: formatters.formatCurrency(row.price),
                }),
              },
              {
                label: "address",
                renderCell: (row) => ({
                  label: formatters.formatAddressShort(row.address),
                }),
              },
              "created",
              {
                label: "schedule",
                renderCell: (row) => ({
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
    routes: allRoutes,
  });
}

