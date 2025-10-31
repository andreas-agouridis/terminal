import { z } from "zod";
import { fn } from "../util/fn";
import { inventoryTable, inventoryRecordTable } from "./inventory.sql";
import { useTransaction } from "../drizzle/transaction";
import { createID } from "../util/id";
import { eq, sum } from "../drizzle/index";

export namespace Inventory {
  export const create = fn(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      initialQuantity: z.number().optional(),
    }),
    async (input) => {
      const inventoryID = await useTransaction(async (tx) => {
        const id = createID("inventory");
        await tx.insert(inventoryTable).values({
          id,
          name: input.name,
          description: input.description || null,
        });
        return id;
      });

      // Create initial record if initialQuantity is provided
      if (input.initialQuantity !== undefined && input.initialQuantity !== 0) {
        await record({
          inventoryID,
          quantity: input.initialQuantity,
          notes: "Initial count",
        });
      }

      return inventoryID;
    },
  );

  export const record = fn(
    z.object({
      inventoryID: z.string(),
      quantity: z.number(),
      notes: z.string().optional(),
    }),
    async (input) =>
      useTransaction(async (tx) =>
        tx.insert(inventoryRecordTable).values({
          id: createID("inventoryRecord"),
          quantity: input.quantity,
          inventoryID: input.inventoryID,
          notes: input.notes || null,
        }),
      ),
  );

  export const getTotal = fn(
    z.object({
      inventoryID: z.string(),
    }),
    async (input) =>
      useTransaction(async (tx) => {
        const result = await tx
          .select({
            total: sum(inventoryRecordTable.quantity),
          })
          .from(inventoryRecordTable)
          .where(eq(inventoryRecordTable.inventoryID, input.inventoryID));

        // sum() returns null if no records exist, default to 0
        return (result[0]?.total ?? 0) as number;
      }),
  );

  export const setCount = fn(
    z.object({
      inventoryID: z.string(),
      targetCount: z.number(),
      notes: z.string().optional(),
    }),
    async (input) => {
      const currentTotal = await getTotal({ inventoryID: input.inventoryID });
      const difference = input.targetCount - currentTotal;

      // Only create a record if there's a difference
      if (difference !== 0) {
        await record({
          inventoryID: input.inventoryID,
          quantity: difference,
          notes: input.notes || `Manual override: ${currentTotal} → ${input.targetCount}`,
        });
      }
    },
  );
}
