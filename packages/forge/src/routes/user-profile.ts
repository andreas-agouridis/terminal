import { Action, Layout, Page, ctx, io } from "@forgeapp/sdk";
import { useTransaction } from "@terminal/core/drizzle/transaction";
import { addressTable } from "@terminal/core/address/address.sql";
import { eq } from "@terminal/core/drizzle/index";
import { createID } from "@terminal/core/util/id";
import * as queries from "../queries";
import * as formatters from "../formatters";

export const UserProfile = new Page({
  name: "User Profile",
  unlisted: true,
  routes: {
    addAddress: new Action({
      name: "Add Address",
      unlisted: true,
      handler: async () => {
        const userID = ctx.params.userID as string | undefined;
        if (!userID) {
          throw new Error("User ID is required");
        }

        const user = await queries.getUser(userID);
        if (!user) {
          throw new Error("User not found");
        }

        const [name, street1, street2, city, province, zip, country, phone] =
          await io.group([
            io.input.text("Name", { placeholder: "Recipient name" }),
            io.input.text("Street 1", { placeholder: "Street address" }),
            io.input.text("Street 2", { placeholder: "Apt, suite, etc." }).optional(),
            io.input.text("City"),
            io.input.text("State / Province"),
            io.input.text("Zip / Postal Code"),
            io.input.text("Country", {
              placeholder: "2-letter country code (e.g. US)",
              defaultValue: "US",
            }),
            io.input.text("Phone", { placeholder: "Phone number" }).optional(),
          ]);

        // Create the address for this user
        const addressID = createID("userShipping");
        await useTransaction(async (tx) => {
          await tx.insert(addressTable).values({
            id: addressID,
            userID,
            address: {
              name,
              street1,
              street2,
              city,
              province,
              zip,
              country,
              phone,
            },
          });
        });

        await ctx.redirect({
          route: "userProfile",
          params: { userID },
        });
      },
    }),
    editAddress: new Action({
      name: "Edit Address",
      unlisted: true,
      handler: async () => {
        const userID = ctx.params.userID as string | undefined;
        const addressID = ctx.params.addressID as string | undefined;

        if (!userID) {
          throw new Error("User ID is required");
        }
        if (!addressID) {
          throw new Error("Address ID is required");
        }

        const address = await queries.getAddress(addressID);
        if (!address) {
          throw new Error("Address not found");
        }

        // Verify the address belongs to this user
        if (address.userID !== userID) {
          throw new Error("Address does not belong to this user");
        }

        const [name, street1, street2, city, province, zip, country, phone] =
          await io.group([
            io.input.text("Name", {
              placeholder: "Recipient name",
              defaultValue: address.address?.name || "",
            }),
            io.input.text("Street 1", {
              placeholder: "Street address",
              defaultValue: address.address?.street1 || "",
            }),
            io.input
              .text("Street 2", {
                placeholder: "Apt, suite, etc.",
                defaultValue: address.address?.street2 || "",
              })
              .optional(),
            io.input.text("City", {
              defaultValue: address.address?.city || "",
            }),
            io.input.text("State / Province", {
              defaultValue: address.address?.province || "",
            }),
            io.input.text("Zip / Postal Code", {
              defaultValue: address.address?.zip || "",
            }),
            io.input.text("Country", {
              placeholder: "2-letter country code (e.g. US)",
              defaultValue: address.address?.country || "US",
            }),
            io.input
              .text("Phone", {
                placeholder: "Phone number",
                defaultValue: address.address?.phone || "",
              })
              .optional(),
          ]);

        // Update the address
        await useTransaction(async (tx) => {
          await tx
            .update(addressTable)
            .set({
              address: {
                name,
                street1,
                street2,
                city,
                province,
                zip,
                country,
                phone,
              },
            })
            .where(eq(addressTable.id, addressID));
        });

        await ctx.redirect({
          route: "userProfile",
          params: { userID },
        });
      },
    }),
  },
  handler: async () => {
    const userID = ctx.params.userID as string | undefined;
    if (!userID) {
      throw new Error("User ID is required. Navigate to this page from the User list.");
    }

    const user = await queries.getUser(userID);
    if (!user) {
      throw new Error("User not found");
    }

    return new Layout({
      title: `User Profile: ${user.name || user.email || userID}`,
      menuItems: [
        {
          label: "Add Address",
          route: "userProfile/addAddress",
          params: {
            userID,
          },
        },
      ],
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
                label: formatters.formatBoolean(!!row.timePrinted),
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
            {
              label: "id",
              renderCell: (row) => ({
                label: row.id,
                route: "userProfile/editAddress",
                params: {
                  userID,
                  addressID: row.id,
                },
              }),
            },
            {
              label: "address",
              renderCell: (row) => ({
                label: formatters.formatAddressFull(row.address),
                route: "userProfile/editAddress",
                params: {
                  userID,
                  addressID: row.id,
                },
              }),
            },
            "timeCreated",
          ],
          rowMenuItems: (row) => [
            {
              label: "Edit Address",
              route: "userProfile/editAddress",
              params: {
                userID,
                addressID: row.id,
              },
            },
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
