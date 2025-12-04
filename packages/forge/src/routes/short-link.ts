import { Action, Layout, Page, ctx, io } from "@forgeapp/sdk";
import { ShortLink } from "@terminal/core/short-link/index";

export const ShortLinkPage = new Page({
  name: "Short Links",
  handler: async () => {
    const [activeLinks, deletedLinks] = await Promise.all([
      ShortLink.list(),
      ShortLink.listDeleted(),
    ]);
    return new Layout({
      title: "Short Links",
      children: [
        io.display.table("Active Links", {
          data: activeLinks,
          columns: [
            {
              label: "Slug",
              renderCell: (row) => ({
                label: row.slug,
                url: `https://trm.sh/${row.slug}`,
              }),
            },
            "url",
            {
              label: "Clicks",
              renderCell: (row) => ({
                label: row.clickCount.toString(),
              }),
            },
            {
              label: "Created",
              renderCell: (row) => ({
                label: row.timeCreated.toLocaleDateString(),
              }),
            },
          ],
          rowMenuItems: (row) => [
            {
              label: "Edit",
              route: "shortLink/edit",
              params: { id: row.id.toString() },
            },
            {
              label: "Delete",
              route: "shortLink/delete",
              params: { id: row.id.toString() },
            },
          ],
        }),
        io.display.table("Inactive Links", {
          data: deletedLinks,
          columns: [
            {
              label: "Slug",
              renderCell: (row) => ({
                label: row.slug,
              }),
            },
            "url",
            {
              label: "Clicks",
              renderCell: (row) => ({
                label: row.clickCount.toString(),
              }),
            },
            {
              label: "Created",
              renderCell: (row) => ({
                label: row.timeCreated.toLocaleDateString(),
              }),
            },
          ],
          rowMenuItems: (row) => [
            {
              label: "Restore",
              route: "shortLink/restore",
              params: { id: row.id.toString() },
            },
          ],
        }),
      ],
    });
  },
  routes: {
    create: new Action({
      name: "New Link",
      handler: async () => {
        const [slug, url] = await io.group([
          io.input.text("slug", {
            helpText: "The path part of the URL (e.g., 'coffee' for trm.sh/coffee)",
          }),
          io.input.text("url", {
            helpText: "The destination URL to redirect to",
          }),
        ]);
        await ShortLink.create({ slug, url });
        await ctx.redirect({ route: "shortLink" });
      },
    }),
    edit: new Action({
      name: "Edit Link",
      unlisted: true,
      handler: async () => {
        const id = parseInt(ctx.params.id as string);
        const links = await ShortLink.list();
        const link = links.find((l) => l.id === id);
        if (!link) {
          throw new Error("Link not found");
        }

        const [slug, url] = await io.group([
          io.input.text("slug", {
            defaultValue: link.slug,
            helpText: "The path part of the URL (e.g., 'coffee' for trm.sh/coffee)",
          }),
          io.input.text("url", {
            defaultValue: link.url,
            helpText: "The destination URL to redirect to",
          }),
        ]);
        await ShortLink.update({ id, slug, url });
        await ctx.redirect({ route: "shortLink" });
      },
    }),
    delete: new Action({
      name: "Delete Link",
      unlisted: true,
      handler: async () => {
        const id = parseInt(ctx.params.id as string);
        const links = await ShortLink.list();
        const link = links.find((l) => l.id === id);
        if (!link) {
          throw new Error("Link not found");
        }

        const confirmed = await io.confirm(`Delete short link "${link.slug}"?`, {
          helpText: `This will remove the redirect from trm.sh/${link.slug}`,
        });

        if (confirmed) {
          await ShortLink.remove(id);
        }
        await ctx.redirect({ route: "shortLink" });
      },
    }),
    restore: new Action({
      name: "Restore Link",
      unlisted: true,
      handler: async () => {
        const id = parseInt(ctx.params.id as string);
        const links = await ShortLink.listDeleted();
        const link = links.find((l) => l.id === id);
        if (!link) {
          throw new Error("Link not found");
        }

        const confirmed = await io.confirm(`Restore short link "${link.slug}"?`, {
          helpText: `This will re-enable the redirect at trm.sh/${link.slug}`,
        });

        if (confirmed) {
          await ShortLink.restore(id);
        }
        await ctx.redirect({ route: "shortLink" });
      },
    }),
  },
});
