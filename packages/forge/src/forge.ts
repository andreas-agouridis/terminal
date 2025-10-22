import { Forge } from "@forgeapp/sdk";
import { Resource } from "sst";

import Product from "./routes/product";
import { Cart } from "./routes/cart";
import { User } from "./routes/user";
import { Order } from "./routes/order";
import { InventoryPage } from "./routes/inventory";
import { Subs } from "./routes/subs";
import { CronSubs } from "./routes/cronsubs";

const forge = new Forge({
  apiKey: Resource.ForgeKey.value,
  endpoint: "wss://terminal.app.forgeapp.io/websocket",
  routes: {
    product: Product,
    cart: Cart,
    user: User,
    order: Order,
    inventory: InventoryPage,
    subsCoffee: Subs,
	subsCron: CronSubs,
  },
});

forge.listen();
