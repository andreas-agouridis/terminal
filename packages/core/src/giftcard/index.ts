import * as z from "zod";
import { createID } from "../util/id";
import { giftCardTable } from "./giftcard.sql";
import { eq } from "drizzle-orm";
import { fn } from "../util/fn";
import { useTransaction } from "../drizzle/transaction";
import { defineEvent } from "../event";
import { bus } from "sst/aws/bus";
import { Resource } from "sst";
import { afterTx } from "../drizzle/transaction";
import { VisibleError, ErrorCodes } from "../error";
import { Common } from "../common";
import { Examples } from "../examples";

export module GiftCard {
  export const Info = z.object({
    id: z.string().openapi({
      description: Common.IdDescription,
      example: Examples.GiftCard.id,
    }),
    orderID: z.string().optional().openapi({
      description: "ID of the order that purchased the gift card.",
      example: Examples.GiftCard.orderID,
    }),
    value: z.number().openapi({
      description: "Value of the gift card in cents (USD).",
      example: Examples.GiftCard.value,
    }),
    balance: z.number().openapi({
      description: "Remaining balance of the gift card in cents (USD).",
      example: Examples.GiftCard.balance,
    }),
    recipientEmail: z.string().email().openapi({
      description: "Email address of the recipient of the gift card.",
      example: Examples.GiftCard.recipientEmail,
    }),
  });

  export type Info = z.infer<typeof Info>;

  export const Event = {
    Created: defineEvent(
      "gift_card.created",
      z.object({
        giftCardID: z.string(),
      }),
    ),
  };

  export const create = fn(
    z.object({
      value: z.number(),
      recipientEmail: z.string().email(),
      orderID: z.string().optional(),
    }),
    async (input) => {
      return useTransaction(async (tx) => {
        const id = createID("giftCard");

        const response = await tx.insert(giftCardTable).values({
          id,
          orderID: input.orderID,
          value: input.value,
          balance: input.value, // Initially, balance equals value
          recipientEmail: input.recipientEmail,
        });
        if (!response.rowsAffected) {
          throw new VisibleError(
            "internal",
            ErrorCodes.Server.INTERNAL_ERROR,
            "Failed to create gift card",
          );
        }

        // Emit event for gift card creation
        await afterTx(() =>
          bus.publish(Resource.Bus, Event.Created, { giftCardID: id }),
        );

        return id;
      });
    },
  );

  export const fromID = fn(Info.shape.id, async (id) =>
    useTransaction((tx) =>
      tx
        .select()
        .from(giftCardTable)
        .where(eq(giftCardTable.id, id))
        .then((rows) => rows.map(serialize).at(0)),
    ),
  );

  export const updateBalance = fn(
    z.object({
      id: z.string(),
      newBalance: z.number(),
    }),
    async (input) => {
      return useTransaction(async (tx) => {
        const response = await tx
          .update(giftCardTable)
          .set({ balance: input.newBalance })
          .where(eq(giftCardTable.id, input.id));

        if (!response.rowsAffected) {
          throw new VisibleError(
            "not_found",
            ErrorCodes.NotFound.RESOURCE_NOT_FOUND,
            `Gift card with ID ${input.id} not found`,
          );
        }
      });
    },
  );

  function serialize(
    input: typeof giftCardTable.$inferSelect,
  ): z.infer<typeof Info> {
    return {
      id: input.id,
      orderID: input.orderID || undefined,
      value: input.value,
      balance: input.balance,
      recipientEmail: input.recipientEmail,
    };
  }
}
