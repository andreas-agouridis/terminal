import { z } from "zod";
import { ErrorResponses, Result, validator, authRequired } from "./common";
import { Cart } from "@terminal/core/cart/index";
import { describeRoute } from "hono-openapi";
import { Hono } from "hono";
import { Card } from "@terminal/core/card/index";
import { Examples } from "@terminal/core/examples";
import { Address } from "@terminal/core/address/index";
import { Order } from "@terminal/core/order/order";

export module CartApi {
  export const route = new Hono()
    .get(
      "/",
      describeRoute({
        tags: ["Cart"],
        summary: "Get cart",
        description: "Get the current user's cart.",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: Result(
                  Cart.Info.openapi({
                    description: "The current user's cart.",
                    example: Examples.Cart,
                  }),
                ),
              },
            },
            description: "The current user's cart.",
          },
          401: ErrorResponses[401],
          429: ErrorResponses[429],
          500: ErrorResponses[500],
        },
      }),
      authRequired,
      async (c) => {
        return c.json(
          {
            data: await Cart.get(),
          },
          200,
        );
      },
    )
    .put(
      "/item",
      describeRoute({
        tags: ["Cart"],
        summary: "Add item",
        description: "Add an item to the current user's cart.",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: Result(
                  Cart.Info.openapi({
                    description: "The updated cart.",
                    example: Examples.Cart,
                  }),
                ),
              },
            },
            description: "The updated cart.",
          },
          400: ErrorResponses[400],
          401: ErrorResponses[401],
          429: ErrorResponses[429],
          500: ErrorResponses[500],
        },
      }),
      authRequired,
      validator(
        "json",
        z.object({
          productVariantID: Cart.Item.shape.productVariantID.openapi({
            description: "ID of the product variant to add to the cart.",
            example: Examples.CartItem.productVariantID,
          }),
          quantity: Cart.Item.shape.quantity.openapi({
            description: "Quantity of the item to add to the cart.",
            example: Examples.CartItem.quantity,
          }),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json");
        await Cart.setItem(body);
        return c.json({ data: await Cart.get() }, 200);
      },
    )
    .put(
      "/address",
      describeRoute({
        tags: ["Cart"],
        summary: "Set address",
        description: "Set the shipping address for the current user's cart.",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: Result(z.literal("ok")),
              },
            },
            description: "Address was set successfully.",
          },
          400: ErrorResponses[400],
          401: ErrorResponses[401],
          429: ErrorResponses[429],
          500: ErrorResponses[500],
        },
      }),
      authRequired,
      validator(
        "json",
        z.object({
          addressID: Address.Info.shape.id.openapi({
            description:
              "ID of the shipping address to set for the current user's cart.",
            example: Examples.Shipping.id,
          }),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json");
        await Cart.setAddress(body.addressID);
        return c.json({ data: "ok" as const }, 200);
      },
    )
    .put(
      "/card",
      describeRoute({
        tags: ["Cart"],
        summary: "Set card",
        description: "Set the credit card for the current user's cart.",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: Result(z.literal("ok")),
              },
            },
            description: "Card was set successfully.",
          },
          400: ErrorResponses[400],
          401: ErrorResponses[401],
          429: ErrorResponses[429],
          500: ErrorResponses[500],
        },
      }),
      authRequired,
      validator(
        "json",
        z.object({
          cardID: Card.Info.shape.id.openapi({
            description:
              "ID of the credit card to set for the current user's cart.",
            example: Examples.Card.id,
          }),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json");
        await Cart.setCard(body.cardID);
        return c.json({ data: "ok" as const }, 200);
      },
    )
    .post(
      "/convert",
      describeRoute({
        tags: ["Cart"],
        summary: "Convert to order",
        description: "Convert the current user's cart to an order.",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: Result(
                  Order.Info.openapi({
                    description: "New order information.",
                    example: Examples.Order,
                  }),
                ),
              },
            },
            description: "Cart was converted successfully.",
          },
          400: ErrorResponses[400],
          401: ErrorResponses[401],
          429: ErrorResponses[429],
          500: ErrorResponses[500],
        },
      }),
      authRequired,
      validator(
        "json",
        z
          .object({
            recipientEmail: z.string().email().optional(),
          })
          .optional(),
      ),
      async (c) => {
        const body = c.req.valid("json");
        const orderID = await Order.convertCart(body?.recipientEmail);
        return c.json({ data: await Order.fromID(orderID) }, 200);
      },
    )
    .put(
      "/gift-card",
      describeRoute({
        tags: ["Cart"],
        summary: "Redeem gift card",
        description: "Apply a gift card to the current user's cart.",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: Result(
                  z
                    .object({
                      giftCardID: z.string(),
                      appliedAmount: z.number().int(),
                      remainingBalance: z.number().int(),
                    })
                    .openapi({
                      description: "Gift card redemption result",
                    }),
                ),
              },
            },
            description: "Gift card was applied successfully.",
          },
          400: ErrorResponses[400],
          401: ErrorResponses[401],
          429: ErrorResponses[429],
          500: ErrorResponses[500],
        },
      }),
      authRequired,
      validator(
        "json",
        z.object({
          giftCardID: z.string(),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json");
        const result = await Cart.redeemGiftCard(body.giftCardID);
        return c.json({ data: result }, 200);
      },
    )
    .delete(
      "/gift-card",
      describeRoute({
        tags: ["Cart"],
        summary: "Remove gift card",
        description: "Remove the gift card from the current user's cart.",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: Result(z.literal("ok")),
              },
            },
            description: "Gift card was removed successfully.",
          },
          401: ErrorResponses[401],
          429: ErrorResponses[429],
          500: ErrorResponses[500],
        },
      }),
      authRequired,
      async (c) => {
        await Cart.removeGiftCard();
        return c.json({ data: "ok" as const }, 200);
      },
    );
}
