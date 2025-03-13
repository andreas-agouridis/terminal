import { handle } from "hono/aws-lambda";
import { create } from "opencontrol";
import { tool } from "opencontrol/tool";
import { z } from "zod";

import { db } from "@terminal/core/drizzle/index";
import { Inventory } from "@terminal/core/inventory/index";
import { Resource } from "sst";
import { tools } from "sst/opencontrol";
import { GiftCard } from "@terminal/core/giftcard/index";

const database = tool({
  name: "database_query_readonly",
  description:
    "Readonly database query for MySQL, use this if there are no direct tools",
  args: z.object({ query: z.string() }),
  async run(input) {
    return db.transaction(async (tx) => tx.execute(input.query), {
      accessMode: "read only",
      isolationLevel: "read committed",
    });
  },
});

const inventory = tool({
  name: "inventory_record",
  description: "Record new inventory event to track in or out amounts",
  args: Inventory.record.schema,
  async run(input) {
    return Inventory.record(input);
  },
});

const giftcard = tool({
  name: "giftcard_create",
  description:
    "Create a new gift card. The `value` argument is in cents (USD).",
  args: GiftCard.create.schema,
  async run(input) {
    return GiftCard.create(input);
  },
});

const stripe = tool({
  name: "stripe",
  description: "make a call to the stripe api",
  args: z.object({
    method: z.string().describe("HTTP method to use"),
    path: z.string().describe("Path to call"),
    query: z.record(z.string()).optional().describe("Query params"),
    contentType: z.string().optional().describe("HTTP content type to use"),
    body: z.string().optional().describe("HTTP body to use if it is not GET"),
  }),
  async run(input) {
    const url = new URL("https://api.stripe.com" + input.path);
    if (input.query) url.search = new URLSearchParams(input.query).toString();
    const response = await fetch(url.toString(), {
      method: input.method,
      headers: {
        Authorization: `Bearer ${Resource.StripeSecret.value}`,
        "Content-Type": input.contentType,
      },
      body: input.body ? input.body : undefined,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.text();
  },
});

export const terminal = [
  tool({
    name: "terminal_openapi",
    description:
      "OpenAPI documentation for the terminal API, which is used to order coffee",
    async run() {
      return fetch(Resource.Api.url + "/doc").then((res) => res.json());
    },
  }),
  tool({
    name: "terminal_call",
    description: "Call the terminal API",
    args: z.object({
      method: z.string().describe("HTTP method to use"),
      path: z.string().describe("Path to call"),
      query: z.record(z.string()).optional().describe("Query params"),
      body: z.any().optional().describe("HTTP body to use if it is not GET"),
      token: z
        .string()
        .describe("Personal access token that you should ask the user for"),
    }),
    async run(input) {
      console.log(input.method, Resource.Api.url + input.path);
      return fetch(Resource.Api.url + input.path, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/json",
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      }).then((res) => res.text());
    },
  }),
];

const app = create({
  key: process.env.OPENCONTROL_KEY,
  tools: [database, inventory, giftcard, stripe, ...terminal, ...tools],
});

export const handler = handle(app);
