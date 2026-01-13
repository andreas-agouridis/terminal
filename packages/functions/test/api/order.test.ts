import { describe, expect } from "bun:test";
import {
  getTestAddressID,
  getTestCardID,
  getTestProductVariantID,
  setupApiTest,
} from "./util";
import { Address } from "@terminal/core/address/index";
import { Card } from "@terminal/core/card/index";
import { Order } from "@terminal/core/order/order";
import { ErrorCodes } from "@terminal/core/error";

const { test, validateOpenAPIRoute, post, expectError } = setupApiTest();

describe("order", () => {
  test("GET /order", async () => {
    const response = await validateOpenAPIRoute("get", "/order");
    expect(response.data).toBeArray();
  });

  test("GET /order/:id", async () => {
    const productVariantID = await getTestProductVariantID();
    const cardID = await getTestCardID();
    const addressID = await getTestAddressID();

    const orderID = await Order.create({
      variants: {
        [productVariantID]: 1,
      },
      cardID,
      addressID,
    });
    const response = await validateOpenAPIRoute("get", "/order/:id", {
      id: orderID,
    });
    expect(response.data.id).toBe(orderID);
  });

  test("POST /order", async () => {
    const productVariantID = await getTestProductVariantID();
    const cardID = await getTestCardID();
    const addressID = await getTestAddressID();

    const response = await validateOpenAPIRoute("post", "/order", undefined, {
      variants: {
        [productVariantID]: 1,
      },
      cardID,
      addressID,
    });
    const created = await Order.fromID(response.data);
    expect(created).toBeDefined();
    expect(created!.items).toHaveLength(1);
  });

  test("POST /order rejects negative quantities", async () => {
    const productVariantID = await getTestProductVariantID();
    const cardID = await getTestCardID();
    const addressID = await getTestAddressID();

    const res = await post("/order", {
      variants: {
        [productVariantID]: -1,
      },
      cardID,
      addressID,
    });
    await expectError(res, 400, ErrorCodes.Validation.INVALID_PARAMETER);
  });

  test("POST /order rejects zero quantities", async () => {
    const productVariantID = await getTestProductVariantID();
    const cardID = await getTestCardID();
    const addressID = await getTestAddressID();

    const res = await post("/order", {
      variants: {
        [productVariantID]: 0,
      },
      cardID,
      addressID,
    });
    await expectError(res, 400, ErrorCodes.Validation.INVALID_PARAMETER);
  });
});
