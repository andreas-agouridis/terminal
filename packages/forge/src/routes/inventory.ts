import { Action, Layout, Page, ctx, io } from "@forgeapp/sdk";
import { useTransaction } from "@terminal/core/drizzle/transaction";
import { desc, eq, sum } from "@terminal/core/drizzle/index";
import {
  inventoryRecordTable,
  inventoryTable,
} from "@terminal/core/inventory/inventory.sql";
import { Inventory } from "@terminal/core/inventory/index";

export const InventoryPage = new Page({
  name: "Inventory",
  handler: async () => {
    const totals = await useTransaction((tx) =>
      tx
        .select({
          id: inventoryTable.id,
          name: inventoryTable.name,
          total: sum(inventoryRecordTable.quantity),
        })
        .from(inventoryTable)
        .leftJoin(
          inventoryRecordTable,
          eq(inventoryTable.id, inventoryRecordTable.inventoryID),
        )
        .groupBy(inventoryTable.id, inventoryTable.name),
    );
    return new Layout({
      title: "Inventory",
      children: [
        io.display.table("Totals", {
          isFilterable: false,
          data: totals,
          rowMenuItems: (row) => [
            {
              label: "History",
              route: "inventory/history",
              params: {
                inventoryID: row.id,
              },
            },
          ],
        }),
      ],
    });
  },
  routes: {
    create: new Action({
      name: "New item",
      handler: async () => {
        const [name, description, initialQuantity] = await io.group([
          io.input.text("name"),
          io.input.text("description"),
          io.input.number("initial quantity").optional(),
        ]);
        await Inventory.create({
          name,
          description,
          initialQuantity,
        });
      },
    }),
    adjust: new Action({
      name: "Adjust quantity",
      description: "Positive numbers add to inventory, negative numbers subtract from inventory.",
      handler: async () => {
        const all = await useTransaction((tx) =>
          tx
            .select({
              id: inventoryTable.id,
              name: inventoryTable.name,
            })
            .from(inventoryTable),
        );
        const item = await io.select.single("item", {
          options: all.map((x) => ({
            label: x.name,
            value: x.id,
          })),
        });
        const [quantity, notes] = await io.group([
          io.input.number("quantity change (positive to add, negative to remove)"),
          io.input.text("notes").optional(),
        ]);
        await Inventory.record({
          inventoryID: item.value,
          quantity,
          notes,
        });
      },
    }),
    setCount: new Action({
      name: "Set count",
      handler: async () => {
        const all = await useTransaction((tx) =>
          tx
            .select({
              id: inventoryTable.id,
              name: inventoryTable.name,
            })
            .from(inventoryTable),
        );
        const item = await io.select.single("item", {
          options: all.map((x) => ({
            label: x.name,
            value: x.id,
          })),
        });
        const [targetCount, notes] = await io.group([
          io.input.number("target count"),
          io.input.text("notes").optional(),
        ]);
        await Inventory.setCount({
          inventoryID: item.value,
          targetCount,
          notes,
        });
      },
    }),
    history: new Page({
      name: "History",
      unlisted: true,
      handler: async (input) => {
        const inventoryID = ctx.params.inventoryID as string;
        const records = await useTransaction((tx) =>
          tx
            .select({
              quantity: inventoryRecordTable.quantity,
              notes: inventoryRecordTable.notes,
              created: inventoryRecordTable.timeCreated,
            })
            .from(inventoryRecordTable)
            .where(eq(inventoryRecordTable.inventoryID, inventoryID))
            .orderBy(desc(inventoryRecordTable.timeCreated)),
        );

        return new Layout({
          title: "History",
          children: [
            io.display.table("History", {
              data: records,
            }),
          ],
        });
      },
    }),
  },
});
