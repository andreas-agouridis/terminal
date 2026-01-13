import { beforeAll, expect, test as _test, mock } from "bun:test";
import { app } from "../../src/api/routes";
import { User } from "@terminal/core/user/index";
import { Api } from "@terminal/core/api/api";
import { Actor } from "@terminal/core/actor";
import { z } from "zod";
import { Card } from "@terminal/core/card/index";
import { Product } from "@terminal/core/product/index";
import { Address } from "@terminal/core/address/index";
import { Examples } from "@terminal/core/examples";
import { Order } from "@terminal/core/order/order";
import { ProductFilter } from "@terminal/core/product/filter";
import { Subscription } from "@terminal/core/subscription/subscription";

export const getTestCardID = async () => {
  const [card] = await Card.list();
  if (card) return card.id;
  return await Card.create({ token: "tok_visa" });
};

export const getTestAddressID = async () => {
  const [address] = await Address.list();
  if (address) return address.id;
  return await Address.create(Examples.Address);
};

export const getTestProduct = async (subscription?: boolean) => {
  const [product] = await Product.list().then((r) =>
    r.filter(
      (p) =>
        p.variants.length && (subscription || p.subscription !== "required"),
    ),
  );
  return product!;
};

export const getTestProductID = async (subscription?: boolean) => {
  const product = await getTestProduct(subscription);
  return product.id;
};

export const getTestProductVariantID = async (subscription?: boolean) => {
  const product = await getTestProduct(subscription);
  return product.variants[0]!.id;
};

export const getTestOrderID = async () => {
  const [order] = await Order.list();
  if (order) return order.id;

  const orderID = await Order.create({
    variants: {
      [await getTestProductVariantID()]: 1,
    },
    cardID: await getTestCardID(),
    addressID: await getTestAddressID(),
  });

  return orderID;
};

export const getTestSubscriptionID = async () => {
  const [subscription] = await Subscription.list();
  if (subscription) return subscription.id;
  const productVariantID = await getTestProductVariantID();
  const addressID = await getTestAddressID();
  const cardID = await getTestCardID();
  return await Subscription.create({
    addressID,
    cardID,
    productVariantID,
    quantity: Examples.Subscription.quantity,
    schedule: Examples.Subscription.schedule,
  });
};

/**
 * Setup API test environment with authentication and utility functions
 */
export function setupApiTest() {
  let userID: string;
  let pat: string;

  const withContext = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    return ProductFilter.provide(
      {
        region: "na",
      },
      () => {
        return Actor.Context.provide(
          { type: "user", properties: { userID, clientID: "test-client" } },
          fn,
        );
      },
    );
  };

  beforeAll(async () => {
    // console.debug = mock();
    console.log = mock();
    console.info = mock();
    console.warn = mock();
    console.error = mock();

    userID = await User.create({ fingerprint: "__test-user" });
    await withContext(async () => {
      pat = await Api.Personal.create().then((r) => r.token);
    });
  });

  /**
   * Make an authenticated GET request
   */
  const get = async (path: string, headers?: Record<string, string>) => {
    return app.request(path, {
      headers: {
        authorization: `Bearer ${pat}`,
        "x-terminal-region": "na",
        ...headers,
      },
    });
  };

  /**
   * Make an authenticated POST request
   */
  const post = async (
    path: string,
    body: any,
    headers?: Record<string, string>,
  ) => {
    return app.request(path, {
      method: "post",
      headers: {
        authorization: `Bearer ${pat}`,
        "content-type": "application/json",
        "x-terminal-region": "na",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  };

  /**
   * Make an authenticated PUT request
   */
  const put = async (
    path: string,
    body: any,
    headers?: Record<string, string>,
  ) => {
    return app.request(path, {
      method: "put",
      headers: {
        authorization: `Bearer ${pat}`,
        "content-type": "application/json",
        "x-terminal-region": "na",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  };

  /**
   * Make an authenticated DELETE request
   */
  const del = async (path: string, headers?: Record<string, string>) => {
    return app.request(path, {
      method: "delete",
      headers: {
        authorization: `Bearer ${pat}`,
        "x-terminal-region": "na",
        ...headers,
      },
    });
  };

  /**
   * Make an unauthenticated request
   */
  const noAuth = (...args: Parameters<typeof app.request>) => app.request(...args);

  /**
   * Run a test with context
   */
  const test = (
    label: string,
    fn: () => void | Promise<unknown>,
    options?: Parameters<typeof _test>[2],
  ) => {
    return _test(label, () => withContext(fn), options);
  };

  const request = async (
    method: string = "get",
    path: string,
    body?: any,
  ): Promise<any> => {
    switch (method) {
      case "get":
        return await get(path);
      case "post":
        return await post(path, body);
      case "put":
        return await put(path, body);
      case "delete":
        return await del(path);
      default:
        throw new Error("Method not supported: " + method);
    }
  };

  const validateOpenAPIRoute = async (
    method: "get" | "post" | "put" | "delete" = "get",
    path: string,
    params?: Record<string, string>,
    body?: any,
  ) => {
    // Lazy-load SchemaValidator to avoid circular dependency issues
    const { SchemaValidator } = await import("./schema-validator");
    
    const originalPath = path.toLowerCase();

    const pathParams = path.split("/").filter((x) => x.startsWith(":"));
    if (pathParams.length > 0) {
      const paramsObj: Record<string, string> = Object.fromEntries(
        pathParams
          .map((x) => [x.slice(1), params![x.slice(1)]])
          .filter(([x, y]) => x && y),
      );
      path = path.replace(/:[^/]+/g, (x) => paramsObj[x.slice(1)]!);
    }

    // Get the expected status codes for this route
    const statusCodes = await SchemaValidator.getRouteResponseStatusCodes(
      originalPath,
      method,
    );

    // Determine if the route requires authentication based on status codes
    const requiresAuth = statusCodes.includes(401);

    // Test successful response
    const response = await request(method, path, body);
    expect(response.status).toBe(200);
    const data = await SchemaValidator.validateResponse(response, path, method);

    // Test unauthenticated request
    const unauthRes = await noAuth(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Expect 401 if authenticated, 200 if public route
    if (requiresAuth) {
      expect(unauthRes.status).toBe(401);
    } else {
      expect(unauthRes.status).toBe(200);
    }
    await SchemaValidator.validateResponse(unauthRes, path, method);

    // Test 400 handling if the route defines it
    if (statusCodes.includes(400)) {
      // Create an invalid request body by removing a required field
      const invalidBody = await SchemaValidator.createInvalidRequestBody(
        originalPath,
        method,
      );
      if (invalidBody) {
        const badReqRes = await request(method, path, invalidBody);
        expect(badReqRes.status).toBe(400);
        await SchemaValidator.validateResponse(badReqRes, path, method);
      }
    }

    // Test 404 handling if the route defines it
    if (statusCodes.includes(404)) {
      const notFoundPath = originalPath.replace(/:[^/]+/g, "fake-param");
      const notFoundRes = await request(method, notFoundPath, body);
      expect(notFoundRes.status).toBe(404);
      await SchemaValidator.validateResponse(notFoundRes, notFoundPath, method);
    }

    return data;
  };

  /**
   * Result schema helper that matches the API's { data: T } pattern
   */
  const resultSchema = <T extends z.ZodType>(schema: T) => {
    return z.object({
      data: schema,
    });
  };

  /**
   * Validate common error responses
   */
  const expectError = async (
    response: Response,
    expectedStatus: number,
    expectedCode?: string,
  ) => {
    expect(response.status).toBe(expectedStatus);

    if (expectedCode) {
      const data = await response.json();
      expect(data).toHaveProperty("code", expectedCode);
    }
  };

  return {
    get,
    post,
    put,
    del,
    noAuth,
    test,
    validateOpenAPIRoute,
    resultSchema,
    expectError,
  };
}
