import { Action, ctx, io } from "@forgeapp/sdk";
import { createTransaction, useTransaction } from "@terminal/core/drizzle/transaction";
import { and, eq, inArray, isNotNull, isNull, sql } from "@terminal/core/drizzle/index";
import { productTable, productVariantTable } from "@terminal/core/product/product.sql";
import { subscriptionTable } from "@terminal/core/subscription/subscription.sql";
import { orderItemTable, orderTable } from "@terminal/core/order/order.sql";
import { DateTime } from "luxon";
import { Resource } from "sst";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { createSubscriptionsPage } from "../pages/subscriptions-page";

const COOLDOWN_DAYS = 21;

async function getLastCronSubscriptionSentAt(): Promise<Date | null> {
  // "Sent" == an order was created containing a subscription line item for the Cron product.
  const row = await useTransaction(async (tx) =>
    tx
      .select({
        lastSentAt: sql<Date | null>`MAX(${orderTable.timeCreated})`,
      })
      .from(orderTable)
      .innerJoin(orderItemTable, eq(orderItemTable.orderID, orderTable.id))
      .innerJoin(
        productVariantTable,
        eq(orderItemTable.productVariantID, productVariantTable.id),
      )
      .innerJoin(productTable, eq(productVariantTable.productID, productTable.id))
      .where(and(isNotNull(orderItemTable.subscriptionID), eq(productTable.name, "cron")))
      .limit(1)
      .then((rows) => rows[0]),
  );
  return row?.lastSentAt ?? null;
}

async function getCooldownStatus() {
  const lastRunAt = await getLastCronSubscriptionSentAt();
  const nextAllowedAt = lastRunAt
    ? DateTime.fromJSDate(lastRunAt).toUTC().plus({ days: COOLDOWN_DAYS }).toJSDate()
    : null;
  const allowed = !nextAllowedAt || nextAllowedAt <= new Date();
  return { allowed, lastRunAt, nextAllowedAt };
}

export const CronSubs = createSubscriptionsPage({
  name: "Subs: Cron",
  productFilter: eq(productTable.name, "cron"),
  routeName: "subsCron",
  getHeader: async () => {
    const status = await getCooldownStatus();
    const fmt = (d: Date) =>
      DateTime.fromJSDate(d).toUTC().toFormat("yyyy-LL-dd HH:mm 'UTC'");
    const last = status.lastRunAt ? fmt(status.lastRunAt) : "Never";
    const next = status.nextAllowedAt ? fmt(status.nextAllowedAt) : "Now";
    const allowed = status.allowed ? "Yes" : "No";

    return [
      status.allowed
        ? io.display.markdown("**Run Cron now** is available.")
        : io.display.markdown(
            `**Run Cron now** is disabled until **${next}** (21-day cooldown).`,
          ),
      io.display.metadata("Cron run-now cooldown", {
        layout: "list",
        data: [
          { label: "Allowed now?", value: allowed },
          { label: "Last run", value: last },
          { label: "Next allowed", value: next },
        ],
      }),
    ];
  },
  getMenuItems: async () => {
    const status = await getCooldownStatus();
    if (!status.allowed) return [];
    return [
      {
        label: "Run Cron now",
        route: "subsCron/runNow",
      },
    ];
  },
  routes: {
    runNow: new Action({
      name: "Run Cron now",
      unlisted: true,
      handler: async () => {
        const status = await getCooldownStatus();

        if (!status.allowed) {
          await io.display.markdown(
            `Run is currently disabled. Next allowed at **${status.nextAllowedAt?.toISOString()}**.`,
          );
          await ctx.redirect({ route: "subsCron" });
          return;
        }

        const confirmed = await io.confirm(
          `This will schedule all active Cron subscriptions to be due immediately and start the subscription processor. This cannot be run more than once every ${COOLDOWN_DAYS} days.`,
        );
        if (!confirmed) {
          await ctx.redirect({ route: "subsCron" });
          return;
        }

        await ctx.loading.start({
          label: "Scheduling Cron subscriptions and starting processor",
          description: "This should complete quickly (processor runs async).",
        });

        const target = DateTime.utc().minus({ minutes: 1 }).toJSDate();

        const result = await createTransaction(async (tx) => {
          // Re-check cooldown inside the transaction (best-effort).
          const lastSentRow = await tx
            .select({
              lastSentAt: sql<Date | null>`MAX(${orderTable.timeCreated})`,
            })
            .from(orderTable)
            .innerJoin(orderItemTable, eq(orderItemTable.orderID, orderTable.id))
            .innerJoin(
              productVariantTable,
              eq(orderItemTable.productVariantID, productVariantTable.id),
            )
            .innerJoin(productTable, eq(productVariantTable.productID, productTable.id))
            .where(and(isNotNull(orderItemTable.subscriptionID), eq(productTable.name, "cron")))
            .limit(1)
            .then((rows) => rows[0]);
          const lastSentAt = lastSentRow?.lastSentAt ?? null;
          const cutoff = DateTime.utc().minus({ days: COOLDOWN_DAYS }).toJSDate();
          if (lastSentAt && lastSentAt > cutoff) {
            return {
              updatedSubscriptions: 0,
              reason: "cooldown" as const,
              lastSentAt,
            };
          }

          const subs = await tx
            .select({ id: subscriptionTable.id })
            .from(subscriptionTable)
            .innerJoin(
              productVariantTable,
              eq(subscriptionTable.productVariantID, productVariantTable.id),
            )
            .innerJoin(
              productTable,
              eq(productVariantTable.productID, productTable.id),
            )
            .where(
              and(
                isNull(subscriptionTable.timeDeleted),
                eq(productTable.name, "cron"),
              ),
            );

          if (subs.length === 0) {
            return {
              updatedSubscriptions: 0,
              reason: "no_subscriptions" as const,
            };
          }

          await tx
            .update(subscriptionTable)
            .set({
              timeNext: target,
            })
            .where(inArray(subscriptionTable.id, subs.map((s) => s.id)));

          return {
            updatedSubscriptions: subs.length,
            reason: "scheduled" as const,
          };
        });

        if ((result as any).reason === "cooldown") {
          const lastSentAt = (result as any).lastSentAt as Date | undefined;
          const nextAllowedAt = lastSentAt
            ? DateTime.fromJSDate(lastSentAt)
                .toUTC()
                .plus({ days: COOLDOWN_DAYS })
                .toISO()
            : undefined;
          await io.display.markdown(
            `Run is currently disabled because Cron subscriptions were last sent at **${lastSentAt?.toISOString()}**. Next allowed at **${nextAllowedAt}**.`,
          );
          await ctx.redirect({ route: "subsCron" });
          return;
        }

        if ((result as any).reason === "no_subscriptions") {
            await io.display.markdown(
              `No active Cron subscriptions were found to schedule.`,
            );
            return;
          }

        const lambda = new LambdaClient();
        const invoked = await lambda.send(
          new InvokeCommand({
            FunctionName: Resource.SubscriptionProcessorOnDemand.name,
            InvocationType: "Event",
          }),
        );

        await io.display.metadata("Cron run started", {
          layout: "list",
          data: [
            { label: "Subscriptions scheduled", value: result.updatedSubscriptions },
            { label: "Scheduled timeNext", value: target.toISOString() },
            { label: "Processor invoked", value: invoked.StatusCode?.toString() ?? "unknown" },
            {
              label: "Next allowed",
              value: DateTime.utc().plus({ days: COOLDOWN_DAYS }).toISO(),
            },
          ],
        });
      },
    }),
  },
});
