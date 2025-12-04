import { z } from "zod";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  createTransaction,
  Transaction,
  useTransaction,
} from "../drizzle/transaction";
import { fn } from "../util/fn";
import { shortLinkTable } from "./short-link.sql";

export namespace ShortLink {
  export const Info = z.object({
    id: z.number(),
    slug: z.string(),
    url: z.string().url(),
    clickCount: z.number(),
    timeCreated: z.date(),
  });

  export type Info = z.infer<typeof Info>;

  async function assertSlugAvailable(
    tx: Transaction,
    slug: string,
    excludeId?: number,
  ) {
    const rows = await tx
      .select({ id: shortLinkTable.id })
      .from(shortLinkTable)
      .where(
        and(eq(shortLinkTable.slug, slug), isNull(shortLinkTable.timeDeleted)),
      );
    const existing = rows.at(0);
    if (existing && existing.id !== excludeId) {
      throw new Error(
        `An active short link with slug "${slug}" already exists`,
      );
    }
  }

  export const create = fn(
    z.object({
      slug: z.string(),
      url: z.string().url(),
    }),
    (input) =>
      createTransaction(async (tx) => {
        await assertSlugAvailable(tx, input.slug);
        await tx.insert(shortLinkTable).values({
          slug: input.slug,
          url: input.url,
        });
      }),
  );

  export const update = fn(
    z.object({
      id: z.number(),
      slug: z.string(),
      url: z.string().url(),
    }),
    (input) =>
      createTransaction(async (tx) => {
        await assertSlugAvailable(tx, input.slug, input.id);
        await tx
          .update(shortLinkTable)
          .set({
            slug: input.slug,
            url: input.url,
          })
          .where(eq(shortLinkTable.id, input.id));
      }),
  );

  export const remove = fn(z.number(), (id) =>
    useTransaction(async (tx) => {
      await tx
        .update(shortLinkTable)
        .set({ timeDeleted: new Date() })
        .where(eq(shortLinkTable.id, id));
    }),
  );

  export const restore = fn(z.number(), (id) =>
    createTransaction(async (tx) => {
      const rows = await tx
        .select({ slug: shortLinkTable.slug })
        .from(shortLinkTable)
        .where(eq(shortLinkTable.id, id));
      const link = rows.at(0);
      if (!link) {
        throw new Error("Link not found");
      }
      await assertSlugAvailable(tx, link.slug, id);
      await tx
        .update(shortLinkTable)
        .set({ timeDeleted: null })
        .where(eq(shortLinkTable.id, id));
    }),
  );

  export async function list() {
    return useTransaction(async (tx) => {
      const rows = await tx
        .select()
        .from(shortLinkTable)
        .where(isNull(shortLinkTable.timeDeleted));
      return rows.map(serialize);
    });
  }

  export async function listDeleted() {
    return useTransaction(async (tx) => {
      const rows = await tx
        .select()
        .from(shortLinkTable)
        .where(isNotNull(shortLinkTable.timeDeleted));
      return rows.map(serialize);
    });
  }

  export const fromSlug = fn(z.string(), async (slug) =>
    useTransaction((tx) =>
      tx
        .select()
        .from(shortLinkTable)
        .where(eq(shortLinkTable.slug, slug))
        .then((rows) => rows.filter((r) => !r.timeDeleted).map(serialize).at(0)),
    ),
  );

  export const incrementClick = fn(z.string(), (slug) =>
    useTransaction(async (tx) => {
      await tx
        .update(shortLinkTable)
        .set({ clickCount: sql`${shortLinkTable.clickCount} + 1` })
        .where(eq(shortLinkTable.slug, slug));
    }),
  );

  function serialize(
    input: typeof shortLinkTable.$inferSelect,
  ): z.infer<typeof Info> {
    return {
      id: input.id,
      slug: input.slug,
      url: input.url,
      clickCount: input.clickCount,
      timeCreated: input.timeCreated,
    };
  }
}
