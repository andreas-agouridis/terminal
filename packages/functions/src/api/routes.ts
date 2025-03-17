import "zod-openapi/extend";
import { Hono, MiddlewareHandler } from "hono";
import { logger } from "hono/logger";
import { VisibleError, ErrorCodes } from "@terminal/core/error";
import { ProductApi } from "./product";
import { CartApi } from "./cart";
import { ActorContext } from "@terminal/core/actor";
import { CardApi } from "./card";
import { OrderApi } from "./order";
import { Hook } from "./hook";
import { Print } from "./print";
import { EmailApi } from "./email";
import { SubscriptionApi } from "./subscription";
import { createClient } from "@openauthjs/openauth/client";
import { Resource } from "sst";
import { subjects } from "../subject";
import { openAPISpecs } from "hono-openapi";
import { HTTPException } from "hono/http-exception";
import { AddressApi } from "./address";
import { Api } from "@terminal/core/api/api";
import { ProfileApi } from "./profile";
import { ViewApi } from "./view";
import { AppApi } from "./app";
import { TokenApi } from "./token";
import { ProductFilter } from "@terminal/core/product/filter";
import { getRegionFromIP } from "./ipinfo";
import packageJson from "../../package.json" assert { type: "json" };

const client = createClient({
  clientID: "api",
  issuer: Resource.Auth.url,
});

const auth: MiddlewareHandler = async (c, next) => {
  const authHeader =
    c.req.query("authorization") ?? c.req.header("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match || !match[1]) {
      throw new VisibleError(
        "authentication",
        ErrorCodes.Authentication.UNAUTHORIZED,
        "Bearer token not found or improperly formatted",
      );
    }
    const bearerToken = match[1];

    if (bearerToken?.startsWith("trm_")) {
      const token = await Api.Personal.fromToken(bearerToken);
      if (!token)
        throw new VisibleError(
          "authentication",
          ErrorCodes.Authentication.INVALID_TOKEN,
          "Invalid personal access token",
        );
      return ActorContext.with(
        {
          type: "user",
          properties: {
            userID: token.userID,
            auth: {
              type: "personal",
              token: token.id,
            },
          },
        },
        next,
      );
    }

    const result = await client.verify(subjects, bearerToken!);
    if (result.err)
      throw new VisibleError(
        "authentication",
        ErrorCodes.Authentication.INVALID_TOKEN,
        "Invalid bearer token",
      );
    if (result.subject.type === "user") {
      return ActorContext.with(
        {
          type: "user",
          properties: {
            userID: result.subject.properties.userID,
            auth: {
              type: "oauth",
              clientID: result.aud,
            },
          },
        },
        next,
      );
    }
  }

  return ActorContext.with({ type: "public", properties: {} }, next);
};

const filter: MiddlewareHandler = async (c, next) => {
  // Get IP address from headers
  const ip =
    c.req.header("x-terminal-ip") ??
    c.req.header("CloudFront-Viewer-Address")?.split(":")[0];

  // Get existing region header if present
  let region = c.req.header("x-terminal-region") as any;

  // If no region header but we have an IP, look up the region
  if (!region && ip) {
    try {
      region = await getRegionFromIP(ip);
    } catch (error) {
      console.error("Error getting region from IP:", error);
    }
  }

  return ProductFilter.provide(
    {
      region,
      country: (
        c.req.header("x-terminal-country") ??
        c.req.header("CloudFront-Viewer-Country")
      )?.toLowerCase(),
      ip,
      app: c.req.header("x-terminal-app-id"), // ie, 'raycast', 'console.log', 'ssh'
      sdk: c.req.header("X-Stainless-Lang"),
      sdkVersion: c.req.header("X-Stainless-Package-Version"),
      os: c.req.header("X-Stainless-OS"),
    },
    () => {
      console.log("filter", ProductFilter.use());
      return next();
    },
  );
};

export const app = new Hono();
app
  .use(logger())
  .use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    return next();
  })
  .use(auth)
  .use(filter);

export const routes = app
  .route("/product", ProductApi.route)
  .route("/profile", ProfileApi.route)
  .route("/address", AddressApi.route)
  .route("/card", CardApi.route)
  .route("/cart", CartApi.route)
  .route("/order", OrderApi.route)
  .route("/subscription", SubscriptionApi.route)
  .route("/token", TokenApi.route)
  .route("/app", AppApi.route)
  .route("/view", ViewApi.route)
  .route("/email", EmailApi.route)
  .route("/hook", Hook.route)
  .route("/print", Print.route)
  .onError((error, c) => {
    // Handle our custom VisibleError
    if (error instanceof VisibleError) {
      console.error("api error:", error);
      // @ts-expect-error
      return c.json(error.toResponse(), error.statusCode());
    }

    // Handle HTTP exceptions
    if (error instanceof HTTPException) {
      console.error("http error:", error);
      return c.json(
        {
          type: "validation",
          code: ErrorCodes.Validation.INVALID_PARAMETER,
          message: "Invalid request",
        },
        400,
      );
    }

    // Handle any other errors as internal server errors
    console.error("unhandled error:", error);
    return c.json(
      {
        type: "internal",
        code: ErrorCodes.Server.INTERNAL_ERROR,
        message: "Internal server error",
      },
      500,
    );
  });

app.get(
  "/doc",
  openAPISpecs(routes, {
    documentation: {
      info: {
        title: "Terminal API",
        description:
          "The Terminal API gives you access to the same API that powers the award winning Terminal SSH shop (`ssh terminal.shop`).",
        version: packageJson.version ?? "1.0.0",
      },
      components: {
        securitySchemes: {
          Bearer: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [{ Bearer: [] }],
      servers: [
        { description: "Dev", url: "https://api.dev.terminal.shop" },
        { description: "Production", url: "https://api.terminal.shop" },
      ],
    },
  }),
);
