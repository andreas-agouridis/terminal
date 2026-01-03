import { DateTime } from "luxon";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { Transaction, useTransaction } from "../drizzle/transaction";
import { systemJobRunTable } from "./job-run.sql";

export namespace SystemJobRun {
  export const Name = z.string().min(1);

  export type Status = {
    name: string;
    lastRunAt: Date | null;
    nextAllowedAt: Date | null;
    allowed: boolean;
  };

  export async function getStatus(
    name: string,
    cooldownDays: number,
  ): Promise<Status> {
    return useTransaction(async (tx) => getStatusTx(tx, name, cooldownDays));
  }

  export async function getStatusTx(
    tx: any,
    name: string,
    cooldownDays: number,
  ): Promise<Status> {
    const rows = await tx
      .select({
        lastRunAt: systemJobRunTable.timeLastRun,
      })
      .from(systemJobRunTable)
      .where(eq(systemJobRunTable.name, name))
      .limit(1);
    const row = rows[0];

    const lastRunAt = row?.lastRunAt ?? null;
    const nextAllowedAt =
      lastRunAt && cooldownDays > 0
        ? DateTime.fromJSDate(lastRunAt)
            .toUTC()
            .plus({ days: cooldownDays })
            .toJSDate()
        : null;

    const allowed = !nextAllowedAt || nextAllowedAt <= new Date();

    return {
      name,
      lastRunAt,
      nextAllowedAt,
      allowed,
    };
  }

  export const ClaimInput = z.object({
    name: Name,
    cooldownDays: z.number().int().min(0),
    metadata: z.record(z.any()).optional(),
  });
  export type ClaimInput = z.infer<typeof ClaimInput>;

  /**
   * Atomically "claims" a job run with a cooldown window.
   *
   * This is designed to be used inside a transaction that does real work:
   * if the transaction rolls back, the claim rolls back as well.
   */
  export async function claimTx(tx: Transaction, input: ClaimInput) {
    const parsed = ClaimInput.parse(input);

    // Ensure a row exists (idempotent)
    await tx
      .insert(systemJobRunTable)
      .values({
        name: parsed.name,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: sql`VALUES(name)`,
        },
      });

    // Only allow claim if last run is outside cooldown window
    const now = new Date();
    const cutoff =
      parsed.cooldownDays === 0
        ? null
        : DateTime.fromJSDate(now).toUTC().minus({ days: parsed.cooldownDays });

    const update = await tx
      .update(systemJobRunTable)
      .set({
        timeLastRun: now,
        metadata: parsed.metadata ?? null,
      })
      .where(
        and(
          eq(systemJobRunTable.name, parsed.name),
          parsed.cooldownDays === 0
            ? sql`1=1`
            : or(
                isNull(systemJobRunTable.timeLastRun),
                lt(systemJobRunTable.timeLastRun, cutoff!.toJSDate()),
              ),
        ),
      );

    const claimed = update.rowsAffected > 0;
    const status = await getStatusTx(tx, parsed.name, parsed.cooldownDays);

    return {
      claimed,
      ...status,
    };
  }
}

