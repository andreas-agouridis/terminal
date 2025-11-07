import { notLike } from "@terminal/core/drizzle/index";
import { productTable } from "@terminal/core/product/product.sql";
import { createSubscriptionsPage } from "../pages/subscriptions-page";

export const Subs = createSubscriptionsPage({
  name: "Subs: Coffee",
  productFilter: notLike(productTable.name, "cron"),
  enableSearch: true,
  getRowMenuItems: (row) => [
    {
      label: "Cancel",
      route: "subsCoffee/cancel",
      params: {
        id: row.id,
      },
    },
  ],
  redirectRoute: "subsCoffee",
});
