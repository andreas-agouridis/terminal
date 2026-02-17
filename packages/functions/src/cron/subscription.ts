import { Subscription } from "@terminal/core/subscription/subscription";
import { LifetimeCron } from "@terminal/core/subscription/lifetime-cron";

export async function handler() {
  await Subscription.process();
  await LifetimeCron.process();
}
