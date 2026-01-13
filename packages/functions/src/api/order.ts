import { z } from "zod";
import { Result, validator, ErrorResponses, authRequired } from "./common";
import { Order } from "@terminal/core/order/order";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { Examples } from "@terminal/core/examples";
import { ErrorCodes, VisibleError } from "@terminal/core/error";

export namespace OrderApi {
  export const route = new Hono()
    .get(
      "/",
      describeRoute({
        tags: ["Order"],
        summary: "List orders",
        description: "List the orders associated with the current user.",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: Result(
                  Order.Info.array().openapi({
                    description: "List of orders.",
                    example: [Examples.Order],
                  }),
                ),
                example: { data: [Examples.Order] },
              },
            },
            description: "List of orders.",
          },
          401: ErrorResponses[401],
          429: ErrorResponses[429],
          500: ErrorResponses[500],
        },
      }),
      authRequired,
      async (c) => {
        const data = await Order.list();
        return c.json(
          {
            data,
          },
          200,
        );
      },
    )
    .get(
      "/:id",
      describeRoute({
        tags: ["Order"],
        summary: "Get order",
        description: "Get the order with the given ID.",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: Result(
                  Order.Info.openapi({
                    description: "Order information.",
                    example: Examples.Order,
                  }),
                ),
                example: { data: Examples.Order },
              },
            },
            description: "Order information.",
          },
          401: ErrorResponses[401],
          404: ErrorResponses[404],
          429: ErrorResponses[429],
          500: ErrorResponses[500],
        },
      }),
      authRequired,
      validator(
        "param",
        z.object({
          id: z.string().openapi({
            description: "ID of the order to get.",
            example: Examples.Order.id,
          }),
        }),
      ),
      async (c) => {
        const data = await Order.fromID(c.req.valid("param").id);
        if (!data) {
          throw new VisibleError(
            "not_found",
            ErrorCodes.NotFound.RESOURCE_NOT_FOUND,
            "Order not found",
          );
        }
        return c.json({ data }, 200);
      },
    )
    .post(
      "/",
      describeRoute({
        tags: ["Order"],
        summary: "Create order",
        description:
          "Create an order without a cart. The order will be placed immediately.",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: Result(
                  Order.Info.shape.id.openapi({
                    description: "Order ID.",
                    example: Examples.Order.id,
                  }),
                ),
                example: { data: Examples.Order.id },
              },
            },
            description: "Order ID.",
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
            variants: z.record(z.number().int().min(1)).openapi({
              description:
                "Product variants to include in the order, along with their quantities.",
              example: {
                [Examples.ProductVariant.id]: 1,
              },
            }),
            cardID: z
              .string()
              .openapi({ description: "Card ID.", example: Examples.Card.id }),
            addressID: z.string().openapi({
              description: "Shipping address ID.",
              example: Examples.Shipping.id,
            }),
          })
          .openapi({
            description: "Order information.",
            example: {
              cardID: Examples.Card.id,
              addressID: Examples.Shipping.id,
              variants: {
                [Examples.ProductVariant.id]: 1,
              },
            },
          }),
      ),
      async (c) => {
        const orderID = await Order.create(c.req.valid("json"));
        return c.json({ data: orderID }, 200);
      },
    );
}
