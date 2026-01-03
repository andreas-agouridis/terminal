import { Action, ctx, io } from "@forgeapp/sdk";
import { createTransaction } from "@terminal/core/drizzle/transaction";
import { and, eq, inArray, isNull } from "@terminal/core/drizzle/index";
import { productTable, productVariantTable } from "@terminal/core/product/product.sql";
import { subscriptionTable } from "@terminal/core/subscription/subscription.sql";
import { SystemJobRun } from "@terminal/core/system/job-run";
import { DateTime } from "luxon";
import { Resource } from "sst";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { createSubscriptionsPage } from "../pages/subscriptions-page";

const COOLDOWN_DAYS = 21;
const JOB_NAME = `forge:cron-subs:run-now:${Resource.App.stage}`;

export const CronSubs = createSubscriptionsPage({
  name: "Subs: Cron",
  productFilter: eq(productTable.name, "cron"),
  routeName: "subsCron",
  getHeader: async () => {
    const status = await SystemJobRun.getStatus(JOB_NAME, COOLDOWN_DAYS);
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
    const status = await SystemJobRun.getStatus(JOB_NAME, COOLDOWN_DAYS);
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
        const status = await SystemJobRun.getStatus(JOB_NAME, COOLDOWN_DAYS);

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
            const current = await SystemJobRun.getStatusTx(tx, JOB_NAME, COOLDOWN_DAYS);
            return {
              claimed: false,
              ...current,
              updatedSubscriptions: 0,
              reason: "no_subscriptions" as const,
            };
          }

          const claim = await SystemJobRun.claimTx(tx, {
            name: JOB_NAME,
            cooldownDays: COOLDOWN_DAYS,
            metadata: {
              stage: Resource.App.stage,
              requestedAt: new Date().toISOString(),
              subscriptions: subs.length,
            },
          });

          if (!claim.claimed) {
            return {
              ...claim,
              updatedSubscriptions: 0,
              reason: "cooldown" as const,
            };
          }

          await tx
            .update(subscriptionTable)
            .set({
              timeNext: target,
            })
            .where(inArray(subscriptionTable.id, subs.map((s) => s.id)));

          return {
            ...claim,
            updatedSubscriptions: subs.length,
            reason: "scheduled" as const,
          };
        });

        if (!result.claimed) {
          if ((result as any).reason === "no_subscriptions") {
            await io.display.markdown(
              `No active Cron subscriptions were found to schedule.`,
            );
            return;
          }
          await io.display.markdown(
            `Run was not started because it is within the ${COOLDOWN_DAYS}-day cooldown window. Next allowed at **${result.nextAllowedAt?.toISOString()}**.`,
          );
          await ctx.redirect({ route: "subsCron" });
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
              value:
                result.nextAllowedAt?.toISOString() ??
                DateTime.utc().plus({ days: COOLDOWN_DAYS }).toISO(),
            },
          ],
        });
      },
    }),
  },
});
