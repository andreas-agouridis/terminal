import { allSecrets, secret } from "./secret";
import { domain, shortDomain } from "./dns";
import { database } from "./database";
import { webhook as stripeWebhook } from "./stripe";
import { bus } from "./bus";
import { email, shortDomainEmail } from "./email";

sst.Linkable.wrap(random.RandomString, (resource) => ({
  properties: {
    value: resource.result,
  },
}));

export const urls = new sst.Linkable("Urls", {
  properties: {
    api: "https://api." + domain,
    auth: "https://auth." + domain,
    site: $dev ? "http://localhost:4321" : "https://www." + domain,
    short: "https://" + shortDomain,
    openapi: "https://api." + domain + "/doc",
  },
});

export const authFingerprintKey = new random.RandomString(
  "AuthFingerprintKey",
  {
    length: 32,
  },
);

export const auth = new sst.aws.Auth("Auth", {
  authorizer: {
    link: [
      bus,
      secret.StripeSecret,
      shortDomainEmail,
      database,
      email,
      secret.GithubClientID,
      secret.GithubClientSecret,
      secret.TwitchClientSecret,
      secret.TwitchClientID,
      authFingerprintKey,
    ],
    permissions: [
      {
        actions: ["ses:SendEmail"],
        resources: ["*"],
      },
    ],
    handler: "./packages/functions/src/auth2.handler",
  },
  domain: {
    name: "auth." + domain,
    dns: sst.cloudflare.dns(),
  },
  forceUpgrade: "v2",
});

const apiFn = new sst.aws.Function("ApiFn", {
  handler: "./packages/functions/src/api/index.handler",
  streaming: !$dev,
  link: [
    bus,
    secret.StripeSecret,
    secret.ShippoSecret,
    secret.ShippoWebhookSecret,
    secret.EmailOctopusSecret,
    secret.IpinfoToken,
    auth,
    database,
    stripeWebhook,
    urls,
  ],
  url: true,
});

const provider = new aws.Provider("UsEast1", { region: "us-east-1" });

const webAcl = new aws.wafv2.WebAcl(
  "ApiWaf",
  {
    scope: "CLOUDFRONT",
    defaultAction: {
      allow: {},
    },
    visibilityConfig: {
      cloudwatchMetricsEnabled: true,
      metricName: "api-rate-limit-metric",
      sampledRequestsEnabled: true,
    },
    rules: [
      {
        name: "rate-limit-rule",
        priority: 1,
        action: {
          block: {
            customResponse: {
              responseCode: 429,
              customResponseBodyKey: "rate-limit-response",
            },
          },
        },
        statement: {
          rateBasedStatement: {
            limit: 2 * 60, // 2 rps per authorization header
            evaluationWindowSec: 60,
            aggregateKeyType: "CUSTOM_KEYS",
            customKeys: [
              {
                header: {
                  name: "Authorization",
                  textTransformations: [{ priority: 0, type: "NONE" }],
                },
              },
            ],
          },
        },
        visibilityConfig: {
          cloudwatchMetricsEnabled: true,
          metricName: "rate-limit-rule-metric",
          sampledRequestsEnabled: true,
        },
      },
    ],
    customResponseBodies: [
      {
        key: "rate-limit-response",
        content: JSON.stringify({
          type: "rate_limit",
          code: "too_many_requests",
          message: "Rate limit exceeded. Please try again later.",
        }),
        contentType: "APPLICATION_JSON",
      },
    ],
  },
  { provider },
);

export const api = new sst.aws.Router("Api", {
  routes: {
    "/*": apiFn.url,
  },
  domain: {
    name: "api." + domain,
    dns: sst.cloudflare.dns(),
  },
  transform: {
    cdn(args) {
      if (!args.transform) {
        args.transform = {
          distribution: {},
        };
      }
      args.transform!.distribution = {
        webAclId: webAcl.arn,
      };
    },
  },
});

new sst.aws.Cron("InventoryTracker", {
  schedule: "rate(1 day)",
  job: {
    link: [database, secret.StripeSecret],
    handler: "./packages/functions/src/cron/inventory.handler",
  },
});

new sst.aws.Cron("SubscriptionProcessor", {
  schedule: "rate(1 day)",
  job: {
    link: [database, bus, ...Object.values(secret), shortDomainEmail],
    memory: "2048 MB",
    handler: "./packages/functions/src/cron/subscription.handler",
    timeout: "15 minutes",
  },
});

new sst.aws.Cron("EUFulfillment", {
  schedule: "rate(1 day)",
  job: {
    link: [database, shortDomainEmail, email, ...allSecrets],
    handler: "./packages/functions/src/cron/shipping.handler",
  },
});

new sst.aws.Cron("UnshippedOrdersAlert", {
  schedule: "rate(12 hours)",
  job: {
    link: [database, secret.SlackWebhooks.Operations],
    handler: "./packages/functions/src/cron/unshipped.handler",
  },
});

export const outputs = {
  auth: auth.url,
  api: api.url,
};
