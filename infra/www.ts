import { api, auth } from "./api";
import { domain } from "./dns";
import { secret } from "./secret";

export const www = new sst.aws.Astro("Site", {
  domain: {
    name: "www." + domain,
    dns: sst.cloudflare.dns(),
  },
  path: "./packages/www",
  buildCommand: "bun run build",
  link: [api, auth, secret.StripePublic, secret.AirtableSecret],
});

export const outputs = {
  www: www.url,
};
