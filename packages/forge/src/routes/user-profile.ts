import { Layout, Page, ctx, io } from "@forgeapp/sdk";
import * as queries from "../queries";
import * as formatters from "../formatters";

export const UserProfile = new Page({
  name: "User Profile",
  handler: async () => {
    const userID = ctx.params.userID as string | undefined;

    // If no userID provided, show list of users
    if (!userID) {
      return new Layout({
        title: "Users",
        children: [
          io.display.table("Users", {
            getData: async (input) => {
              const queryTerm = input.queryTerm?.trim();
              return queries.getAllUsers(
                {
                  offset: input.offset,
                  pageSize: input.pageSize,
                },
                queryTerm,
              );
            },
            columns: [
              {
                label: "name",
                renderCell: (row) => ({
                  label: row.name || "N/A",
                  route: "userProfile",
                  params: {
                    userID: row.id,
                  },
                }),
              },
              {
                label: "email",
                renderCell: (row) => ({
                  label: row.email || "N/A",
                  route: "userProfile",
                  params: {
                    userID: row.id,
                  },
                }),
              },
              {
                label: "id",
                renderCell: (row) => ({
                  label: row.id,
                  route: "userProfile",
                  params: {
                    userID: row.id,
                  },
                }),
              },
              "timeCreated",
            ],
            isSortable: false,
          }),
        ],
      });
    }

    // UserID provided, show user profile
    const user = await queries.getUser(userID);
    if (!user) {
      throw new Error("User not found");
    }

    return new Layout({
      title: `User Profile: ${user.name || user.email || userID}`,
      children: [
        // User Basic Info
        io.display.metadata("User Information", {
          layout: "grid",
          data: [
            {
              label: "ID",
              value: user.id,
            },
            {
              label: "Name",
              value: user.name || "N/A",
            },
            {
              label: "Email",
              value: user.email || "N/A",
            },
            {
              label: "Stripe Customer ID",
              value: user.stripeCustomerID,
            },
            {
              label: "Email Octopus ID",
              value: user.emailOctopusID || "N/A",
            },
            {
              label: "Fingerprint",
              value: user.fingerprint || "N/A",
            },
            {
              label: "Flags",
              value: JSON.stringify(user.flags || {}),
            },
            {
              label: "Created",
              value: user.timeCreated?.toISOString() || "N/A",
            },
            {
              label: "Updated",
              value: user.timeUpdated?.toISOString() || "N/A",
            },
          ],
        }),

        // Orders Table
        io.display.heading("Orders", { level: 3 }),
        io.display.table("Orders", {
          getData: async (input) =>
            queries.getUserOrders(userID, {
              offset: input.offset,
              pageSize: input.pageSize,
            }),
          rowMenuItems: (row) =>
            [
              row.labelURL && {
                label: "Label",
                url: row.labelURL!,
              },
              row.trackingURL && {
                label: "Tracking",
                url: row.trackingURL!,
              },
            ].filter(Boolean) as any,
          columns: [
            "id",
            {
              label: "amount",
              renderCell: (row) => ({
                label: formatters.formatTotalAmount(row.amount, row.shippingAmount),
              }),
            },
            {
              label: "shipping address",
              renderCell: (row) => ({
                label: formatters.formatShippingAddressInline(row.shippingAddress),
              }),
            },
            "email",
            "created",
            "trackingStatus",
            {
              label: "tracking number",
              renderCell: (row) => ({
                label: row.trackingNumber || "N/A",
              }),
            },
            "fulfiller",
            {
              label: "printed",
              renderCell: (row) => ({
                label: formatters.formatBoolean(row.timePrinted),
              }),
            },
          ],
          isSortable: false,
        }),

        // Subscriptions Table
        io.display.heading("Subscriptions", { level: 3 }),
        io.display.table("Subscriptions", {
          getData: async (input) =>
            queries.getUserSubscriptions(userID, {
              offset: input.offset,
              pageSize: input.pageSize,
            }),
          columns: [
            "id",
            "product",
            "productVariant",
            {
              label: "price",
              renderCell: (row) => ({
                label: formatters.formatCurrency(row.price),
              }),
            },
            "quantity",
            {
              label: "schedule",
              renderCell: (row) => ({
                label: formatters.formatSchedule(row.schedule),
              }),
            },
            "next",
            {
              label: "address",
              renderCell: (row) => ({
                label: formatters.formatAddressShort(row.address),
              }),
            },
            "created",
          ],
          isSortable: false,
        }),

        // Shipping Addresses
        io.display.heading("Shipping Addresses", { level: 3 }),
        io.display.table("Addresses", {
          getData: async (input) =>
            queries.getUserAddresses(userID, {
              offset: input.offset,
              pageSize: input.pageSize,
            }),
          columns: [
            "id",
            {
              label: "address",
              renderCell: (row) => ({
                label: formatters.formatAddressFull(row.address),
              }),
            },
            "timeCreated",
          ],
          isSortable: false,
        }),

        // Payment Methods (Cards)
        io.display.heading("Payment Methods", { level: 3 }),
        io.display.table("Cards", {
          getData: async (input) =>
            queries.getUserCards(userID, {
              offset: input.offset,
              pageSize: input.pageSize,
            }),
          columns: [
            "id",
            "brand",
            {
              label: "last4",
              renderCell: (row) => ({
                label: formatters.formatCardLast4(row.last4),
              }),
            },
            {
              label: "expiration",
              renderCell: (row) => ({
                label: formatters.formatCardExpiration(
                  row.expirationMonth,
                  row.expirationYear,
                ),
              }),
            },
            "timeCreated",
          ],
          isSortable: false,
        }),

        // Cart Info
        io.display.heading("Cart", { level: 3 }),
        io.display.table("Cart", {
          getData: async (input) =>
            queries.getUserCart(userID, {
              offset: input.offset,
              pageSize: input.pageSize,
            }),
          columns: [
            {
              label: "cartID",
              renderCell: (row) => ({
                label: row.cartID || "N/A",
              }),
            },
            {
              label: "items",
              renderCell: (row) => ({
                label: row.items?.toString() || "0",
              }),
            },
            {
              label: "cost",
              renderCell: (row) => ({
                label: formatters.formatTotalAmount(row.cost, row.shippingAmount),
              }),
            },
            {
              label: "shipping service",
              renderCell: (row) => ({
                label: row.shippingService || "N/A",
              }),
            },
          ],
          isSortable: false,
        }),
      ],
    });
  },
});
