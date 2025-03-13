import {
  text,
  mysqlTable,
  varchar,
  int,
  primaryKey,
  json,
} from "drizzle-orm/mysql-core";
import { dollar, id, ulid, timestamps } from "../drizzle/types";
import { inventoryTable } from "../inventory/inventory.sql";
import { z } from "zod";

export const ProductSubscriptionSetting = z.enum(["allowed", "required"]);
export type ProductSubscriptionSetting = z.infer<
  typeof ProductSubscriptionSetting
>;

export const ProductTags = z.object({
  app: z.string().optional(),
  color: z.string().optional(),
  featured: z.boolean().optional(),
  market_na: z.boolean().optional(),
  market_eu: z.boolean().optional(),
  giftcard: z.boolean().optional(),
});
export type ProductTags = z.infer<typeof ProductTags>;

export const productTable = mysqlTable("product", {
  ...id,
  ...timestamps,
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  order: int("order"),
  subscription: varchar("subscription", {
    length: 255,
  }).$type<ProductSubscriptionSetting>(),
  tags: json("tags").$type<ProductTags>(),
});

export const productVariantTable = mysqlTable("product_variant", {
  ...id,
  ...timestamps,
  productID: ulid("product_id")
    .notNull()
    .references(() => productTable.id, {
      onDelete: "cascade",
    }),
  name: varchar("name", { length: 255 }).notNull(),
  price: dollar("price").notNull(),
  weight: int("weight").notNull().default(12),
});

export const productVariantInventoryTable = mysqlTable(
  "product_variant_inventory",
  {
    ...timestamps,
    productVariantID: ulid("product_variant_id")
      .notNull()
      .references(() => productVariantTable.id, {
        onDelete: "cascade",
      }),
    inventoryID: ulid("inventory_id")
      .notNull()
      .references(() => inventoryTable.id, {
        onDelete: "cascade",
      }),
  },
  (table) => ({
    primary: primaryKey({
      columns: [table.productVariantID, table.inventoryID],
    }),
  }),
);
