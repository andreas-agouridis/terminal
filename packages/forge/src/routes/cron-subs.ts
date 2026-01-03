import { Action, ctx, io } from "@forgeapp/sdk";
import { createTransaction } from "@terminal/core/drizzle/transaction";
import { and, eq, inArray, isNull } from "@terminal/core/drizzle/index";
import { productTable, productVariantTable } from "@terminal/core/product/product.sql";
import { subscriptionTable } from "@terminal/core/subscription/subscription.sql";
import { DateTime } from "luxon";
import { Resource } from "sst";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { createSubscriptionsPage } from "../pages/subscriptions-page";

const COOLDOWN_DAYS = 21;
const COOLDOWN_KEY = `cron-subs/run-now/${Resource.App.stage}.json`;

const s3 = new S3Client();

async function getCooldownStatus() {
  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: Resource.IntervalBucket.name,
        Key: COOLDOWN_KEY,
      }),
    );
    const body = await res.Body?.transformToString();
    const parsed = body ? JSON.parse(body) : {};
    const lastRunAt = parsed?.lastRunAt ? new Date(parsed.lastRunAt) : null;
    const nextAllowedAt = lastRunAt
      ? DateTime.fromJSDate(lastRunAt).toUTC().plus({ days: COOLDOWN_DAYS }).toJSDate()
      : null;
    const allowed = !nextAllowedAt || nextAllowedAt <= new Date();
    return { allowed, lastRunAt, nextAllowedAt };
  } catch (e: any) {
    // If the object doesn't exist yet, there's no cooldown.
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) {
      return { allowed: true, lastRunAt: null as Date | null, nextAllowedAt: null as Date | null };
    }
    throw e;
  }
}

async function recordCooldownRun(data: { lastRunAt: Date; updatedSubscriptions: number }) {
  await s3.send(
    new PutObjectCommand({
      Bucket: Resource.IntervalBucket.name,
      Key: COOLDOWN_KEY,
      ContentType: "application/json",
      Body: JSON.stringify({
        lastRunAt: data.lastRunAt.toISOString(),
        updatedSubscriptions: data.updatedSubscriptions,
      }),
    }),
  );
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

          if ((result as any).reason === "no_subscriptions") {
            await io.display.markdown(
              `No active Cron subscriptions were found to schedule.`,
            );
            return;
          }

        // Record cooldown only after we've successfully scheduled subscriptions.
        const now = new Date();
        await recordCooldownRun({
          lastRunAt: now,
          updatedSubscriptions: (result as any).updatedSubscriptions ?? 0,
        });

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
              value: DateTime.fromJSDate(now).toUTC().plus({ days: COOLDOWN_DAYS }).toISO(),
            },
          ],
        });
      },
    }),
  },
});
