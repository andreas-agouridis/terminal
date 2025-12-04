import { Action, Layout, Page, ctx, io } from "@forgeapp/sdk";
import * as queries from "../queries";
import * as formatters from "../formatters";
import { Product } from "@terminal/core/product/index";
import { Order as OrderM } from "@terminal/core/order/order";

export const User = new Page({
  name: "User",
  handler: async (c) => {
    // const domains = await useTransaction(async (tx) => ({
    //   data: await tx
    //     .select({ domain: sql`substring_index(${userTable.email}, '@', -1)` })
    //     .from(userTable)
    //     .groupBy(sql`substring_index(${userTable.email}, '@', -1)`)
    //     .orderBy(desc(count(userTable.id)))
    //     .then((r) => r.map((d) => d.domain)),
    // }));
    return new Layout({
      title: "User",
      children: [
        // io.display.object("Domains", domains),
        io.display.table("", {
          getData: async (input) => {
            const queryTerm = input.queryTerm?.trim() || undefined;
            return queries.getAllUsers(
              {
                offset: input.offset,
                pageSize: input.pageSize,
              },
              queryTerm,
            );
          },
          rowMenuItems: (row) => [
            {
              label: "Create Order",
              route: "user/createOrder",
              params: {
                userID: row.id,
              },
            },
          ],
          isSortable: false,
        }),
      ],
    });
  },
  routes: {
    createOrder: new Action({
      name: "Create Order",
      handler: async () => {
        const userID = ctx.params.userID as string | undefined;
        if (!userID) {
          throw new Error("User ID is required");
        }

        const user = await queries.getUser(userID);
        if (!user) {
          throw new Error("User not found");
        }

        if (!user.email) {
          throw new Error("User email is required to create an order");
        }

        // Get user's addresses
        const addressesResult = await queries.getUserAddresses(userID, {
          offset: 0,
          pageSize: 100, // Get all addresses
        });
        const addresses = addressesResult.data;

        if (addresses.length === 0) {
          throw new Error("User has no saved addresses. Please add an address first.");
        }

        // Select address
        const selectedAddress = await io.select.single("Shipping Address", {
          options: addresses.map((addr) => ({
            label: formatters.formatAddressFull(addr.address),
            value: addr.id,
          })),
        });

        const addressData = addresses.find((a) => a.id === selectedAddress.value)?.address;
        if (!addressData) {
          throw new Error("Selected address not found");
        }

        // Get products and variants
        const products = await Product.list();
        const results = await io.group(
          products.flatMap((product) => {
            return product.variants.map((variant) =>
              io.input.number(`${product.name} - ${variant.name}`, {
                defaultValue: 0,
              }),
            );
          }),
        );

        // Build items object
        const items = {} as Record<string, number>;
        let variantIndex = 0;
        for (const product of products) {
          for (const variant of product.variants) {
            const quantity = results[variantIndex] as number;
            if (quantity > 0) {
              items[variant.id] = quantity;
            }
            variantIndex++;
          }
        }

        if (Object.keys(items).length === 0) {
          throw new Error("No items selected");
        }

        // Create the order
        await OrderM.createInternal({
          email: user.email,
          items,
          address: addressData,
        });

        await ctx.redirect({
          route: "user",
        });
      },
    }),
  },
});
