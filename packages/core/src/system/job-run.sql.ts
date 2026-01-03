import { json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { timestamp, timestamps } from "../drizzle/types";

export const systemJobRunTable = mysqlTable("system_job_run", {
  name: varchar("name", { length: 255 }).notNull().primaryKey(),
  ...timestamps,
  timeLastRun: timestamp("time_last_run"),
  metadata: json("metadata").$type<Record<string, any>>(),
});

