import { z } from "zod";
import { createTransaction, useTransaction } from "../drizzle/transaction";
import { fn } from "../util/fn";
import { cartItemTable, cartTable } from "./cart.sql";
import { createID } from "../util/id";
import { productTable, productVariantTable } from "../product/product.sql";
import { and, eq, getTableColumns, gt, sql, sum } from "drizzle-orm";
import { Actor } from "../actor";
import { cardTable } from "../card/card.sql";
import { ErrorCodes, VisibleError } from "../error";
import { Common } from "../common";
import { Examples } from "../examples";
import { addressTable } from "../address/address.sql";
import { Shipping } from "../shipping";

export namespace Cart {
  export const Item = z
    .object({
      id: z.string().openapi({
        description: Common.IdDescription,
        example: Examples.CartItem.id,
      }),
      productVariantID: z.string().openapi({
        description:
          "ID of the product variant for this item in the current user's cart.",
        example: Examples.CartItem.productVariantID,
      }),
      quantity: z.number().int().min(0).openapi({
        description: "Quantity of the item in the current user's cart.",
        example: Examples.CartItem.quantity,
      }),
      subtotal: z.number().int().openapi({
        description:
          "Subtotal of the item in the current user's cart, in cents (USD).",
        example: Examples.CartItem.subtotal,
      }),
    })
    .openapi({
      ref: "CartItem",
      description: "An item in the current Terminal shop user's cart.",
      example: Examples.CartItem,
    });

  export type Item = z.infer<typeof Item>;

  export const Info = z
    .object({
      items: z.array(Item).openapi({
        description: "An array of items in the current user's cart.",
        example: Examples.Cart.items,
      }),
      subtotal: z.number().int().min(0).openapi({
        description:
          "The subtotal of all items in the current user's cart, in cents (USD).",
        example: Examples.Cart.subtotal,
      }),
      addressID: z.string().optional().openapi({
        description:
          "ID of the shipping address selected on the current user's cart.",
        example: Examples.Cart.addressID,
      }),
      cardID: z.string().optional().openapi({
        description: "ID of the card selected on the current user's cart.",
        example: Examples.Cart.cardID,
      }),
      amount: z
        .object({
          subtotal: z.number().int().openapi({
            description: "Subtotal of the current user's cart, in cents (USD).",
            example: Examples.Cart.amount.subtotal,
          }),
          shipping: z.number().int().optional().openapi({
            description:
              "Shipping amount of the current user's cart, in cents (USD).",
            example: Examples.Cart.amount.shipping,
          }),
          total: z.number().int().optional().openapi({
            description: "Total amount after any discounts, in cents (USD).",
          }),
        })
        .openapi({
          description:
            "The subtotal and shipping amounts for the current user's cart.",
          example: Examples.Cart.amount,
        }),
      shipping: z
        .object({
          service: z.string().optional().openapi({
            description: "Shipping service name.",
            example: Examples.Cart.shipping.service,
          }),
          timeframe: z.string().optional().openapi({
            description: "Shipping timeframe provided by the shipping carrier.",
            example: Examples.Cart.shipping.timeframe,
          }),
        })
        .optional()
        .openapi({
          description: "Shipping information for the current user's cart.",
          example: Examples.Cart.shipping,
        }),
    })
    .openapi({
      ref: "Cart",
      description: "The current Terminal shop user's cart.",
      example: Examples.Cart,
    });

  export type Info = z.infer<typeof Info>;

  export async function get() {
    return createTransaction(async (tx): Promise<Info> => {
      const cart = await tx
        .select({
          cardID: cardTable.id,
          addressID: addressTable.id,
          shippingAmount: cartTable.shippingAmount,
          shippingService: cartTable.shippingService,
          shippingDeliveryEstimate: cartTable.shippingDeliveryEstimate,
        })
        .from(cartTable)
        .leftJoin(cardTable, eq(cartTable.cardID, cardTable.id))
        .leftJoin(addressTable, eq(cartTable.addressID, addressTable.id))
        .where(eq(cartTable.userID, Actor.userID()))
        .then((rows) => rows[0]);
      if (!cart)
        return {
          items: [],
          amount: {
            shipping: 0,
            subtotal: 0,
          },
          subtotal: 0,
        };
      const items = await list();
      const subtotal = items.reduce((acc, item) => item.subtotal + acc, 0);

      const shippingAmount = cart.shippingAmount ?? 0;
      const total = subtotal + shippingAmount;

      return {
        items,
        subtotal,
        amount: {
          subtotal,
          shipping: shippingAmount || undefined,
          total: total || undefined,
        },
        cardID: cart.cardID || undefined,
        addressID: cart.addressID || undefined,
        shipping: {
          service: cart.shippingService || undefined,
          timeframe: cart.shippingDeliveryEstimate || undefined,
        },
      };
    });
  }

  export const list = () =>
    useTransaction(async (tx) => {
      return tx
        .select({
          cartItem: getTableColumns(cartItemTable),
          productVariant: getTableColumns(productVariantTable),
          subtotal: sql<string>`(${cartItemTable.quantity} * ${productVariantTable.price})`,
        })
        .from(cartItemTable)
        .innerJoin(
          productVariantTable,
          eq(cartItemTable.productVariantID, productVariantTable.id),
        )
        .where(
          and(
            eq(cartItemTable.userID, Actor.userID()),
            gt(cartItemTable.quantity, 0),
          ),
        )
        .then((rows): Item[] =>
          rows.map((row) => ({
            id: row.cartItem.id,
            productVariantID: row.productVariant.id,
            quantity: row.cartItem.quantity,
            subtotal: parseInt(row.subtotal, 10),
          })),
        );
    });

  export const setAddress = fn(z.string(), async (addressID) => {
    const shippingInfo = await useTransaction(async (tx) => {
      const response = await tx
        .select({
          count: sum(cartItemTable.quantity).mapWith(Number),
          subtotal:
            sql`sum(${productVariantTable.price} * ${cartItemTable.quantity})`.mapWith(
              Number,
            ),
          weight:
            sql`sum(${productVariantTable.weight} * ${cartItemTable.quantity})`.mapWith(
              Number,
            ),
          address: addressTable.address,
        })
        .from(cartItemTable)
        .innerJoin(
          productVariantTable,
          eq(productVariantTable.id, cartItemTable.productVariantID),
        )
        .innerJoin(addressTable, eq(addressTable.id, addressID))
        .where(
          and(
            eq(cartItemTable.userID, Actor.userID()),
            gt(cartItemTable.quantity, 0),
          ),
        )
        .then((rows) => rows[0]);
      if (!response) {
        throw new VisibleError(
          "validation",
          ErrorCodes.Validation.INVALID_PARAMETER,
          "Address not found.",
        );
      }
      const address = response.address;
      return Shipping.calculate(response.subtotal, address);
    });

    await useTransaction(async (tx) => {
      const id = await tx
        .select({
          addressID: addressTable.id,
        })
        .from(addressTable)
        .where(eq(addressTable.id, addressID))
        .then((rows) => rows[0]!.addressID);
      await tx
        .insert(cartTable)
        .values({
          userID: Actor.userID(),
          addressID: id,
          ...shippingInfo,
          id: createID("cart"),
        })
        .onDuplicateKeyUpdate({
          set: {
            addressID,
            ...shippingInfo,
          },
        });
    });
  });

  export const setCard = fn(z.string(), (input) =>
    useTransaction(async (tx) => {
      const cardID = await tx
        .select({
          cardID: cardTable.id,
        })
        .from(cardTable)
        .where(
          and(eq(cardTable.id, input), eq(cardTable.userID, Actor.userID())),
        )
        .then((rows) => rows[0]?.cardID);
      if (!cardID) {
        throw new VisibleError(
          "validation",
          ErrorCodes.Validation.INVALID_PARAMETER,
          "Card not found.",
        );
      }
      await tx
        .insert(cartTable)
        .values({
          userID: Actor.userID(),
          cardID: cardID,
          id: createID("cart"),
        })
        .onDuplicateKeyUpdate({
          set: {
            cardID,
          },
        });
    }),
  );

  export const setItem = fn(
    z.object({
      id: z.string().optional(),
      productVariantID: Item.shape.productVariantID,
      quantity: Item.shape.quantity,
    }),
    async (input) => {
      return useTransaction(async (tx) => {
        const userID = Actor.userID();
        const id = input.id || createID("cartItem");
        const variant = await tx
          .select({
            id: productVariantTable.id,
            susbcription: productTable.subscription,
          })
          .from(productVariantTable)
          .innerJoin(
            productTable,
            eq(productVariantTable.productID, productTable.id),
          )
          .where(eq(productVariantTable.id, input.productVariantID))
          .then((rows) => rows[0]);
        if (!variant) {
          throw new VisibleError(
            "validation",
            ErrorCodes.Validation.INVALID_PARAMETER,
            "Product variant not found.",
          );
        }
        if (input.quantity <= 0) {
          await tx
            .delete(cartItemTable)
            .where(
              and(
                eq(cartItemTable.productVariantID, variant.id),
                eq(cartItemTable.userID, userID),
              ),
            );
          return;
        }
        if (variant.susbcription === "required") {
          throw new VisibleError(
            "validation",
            ErrorCodes.Validation.INVALID_STATE,
            "This product cannot be added to a cart, it must be purchased via a subscription.",
          );
        }
        await tx
          .insert(cartItemTable)
          .values({
            id,
            quantity: input.quantity,
            productVariantID: variant.id,
            userID,
          })
          .onDuplicateKeyUpdate({
            set: { quantity: input.quantity },
          });
        await tx
          .insert(cartTable)
          .ignore()
          .values({
            userID,
            id: createID("cart"),
          });
      });
    },
  );

  export async function clear() {
    await useTransaction(async (tx) =>
      tx.delete(cartItemTable).where(eq(cartItemTable.userID, Actor.userID())),
    );
  }
}
