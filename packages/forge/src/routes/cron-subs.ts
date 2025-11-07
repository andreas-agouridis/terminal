import { eq } from "@terminal/core/drizzle/index";
import { productTable } from "@terminal/core/product/product.sql";
import { createSubscriptionsPage } from "../pages/subscriptions-page";

export const CronSubs = createSubscriptionsPage({
  name: "Subs: Cron",
  productFilter: eq(productTable.name, "cron"),
  enableSearch: false,
});
