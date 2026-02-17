import { int, mysqlTable, unique } from "drizzle-orm/mysql-core";
import { timestamp, id, timestamps, ulid } from "../drizzle/types";
import { userTable } from "../user/user.sql";
import { productVariantTable } from "../product/product.sql";
import { addressTable } from "../address/address.sql";

export const lifetimeCronSubscriptionTable = mysqlTable(
  "lifetime_cron_subscription",
  {
    ...id,
    ...timestamps,
    timeNext: timestamp("time_next"),
    userID: ulid("user_id")
      .references(() => userTable.id, {
        onDelete: "cascade",
      })
      .notNull(),
    productVariantID: ulid("product_variant_id")
      .references(() => productVariantTable.id, {
        onDelete: "cascade",
      })
      .notNull(),
    quantity: int("quantity").notNull(),
    addressID: ulid("shipping_id")
      .references(() => addressTable.id)
      .notNull(),
  },
  (table) => ({
    unique: unique("unique").on(table.userID, table.productVariantID),
  }),
);
