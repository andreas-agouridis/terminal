import { bigint, int, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { timestamps } from "../drizzle/types";

export const shortLinkTable = mysqlTable("short_link", {
  id: int("id").primaryKey().autoincrement(),
  ...timestamps,
  slug: varchar("slug", { length: 255 }).notNull(),
  url: text("url").notNull(),
  clickCount: bigint("click_count", { mode: "number" }).notNull().default(0),
});
