import { describe, expect } from "bun:test";
import {
  getTestAddressID,
  getTestCardID,
  getTestProductVariantID,
  setupApiTest,
} from "./util";
import { Examples } from "@terminal/core/examples";
import { Cart } from "@terminal/core/cart/index";
import { ErrorCodes } from "@terminal/core/error";

const { test, validateOpenAPIRoute, put, expectError } = setupApiTest();

describe("cart", () => {
  test("GET /cart", async () => {
    const response = await validateOpenAPIRoute("get", "/cart");
    expect(response.data).toBeDefined();
    expect(response.data.items).toBeArray();
  });

  test("DELETE /cart", async () => {
    const response = await validateOpenAPIRoute("delete", "/cart");
    expect(response.data).toBeDefined();
    expect(response.data).toBe("ok");

    const cart = await Cart.get();
    expect(cart.items).toBeEmpty();
  });

  test("PUT /cart/item", async () => {
    const productVariantID = await getTestProductVariantID();
    const response = await validateOpenAPIRoute(
      "put",
      "/cart/item",
      undefined,
      {
        productVariantID: productVariantID,
        quantity: Examples.CartItem.quantity,
      },
    );
    expect(response.data).toBeDefined();
    expect(response.data.items).toBeArray();
    expect(
      response.data.items.some(
        (item: any) =>
          item.productVariantID === productVariantID &&
          item.quantity === Examples.CartItem.quantity,
      ),
    ).toBe(true);
  });

  test("PUT /cart/item rejects negative quantity", async () => {
    const productVariantID = await getTestProductVariantID();
    const res = await put("/cart/item", { productVariantID, quantity: -1 });
    await expectError(res, 400, ErrorCodes.Validation.INVALID_PARAMETER);
  });

  test("PUT /cart/address", async () => {
    const addressID = await getTestAddressID();
    const response = await validateOpenAPIRoute(
      "put",
      "/cart/address",
      undefined,
      { addressID },
    );
    expect(response.data).toBe("ok");
  });

  test("PUT /cart/card", async () => {
    const cardID = await getTestCardID();
    const response = await validateOpenAPIRoute(
      "put",
      "/cart/card",
      undefined,
      { cardID },
    );
    expect(response.data).toBe("ok");
  });

  test("POST /cart/convert", async () => {
    const productVariantID = await getTestProductVariantID();
    await Cart.setItem({
      productVariantID: productVariantID,
      quantity: Examples.CartItem.quantity,
    });
    const addressID = await getTestAddressID();
    await Cart.setAddress(addressID);
    const cardID = await getTestCardID();
    await Cart.setCard(cardID);

    // Now convert the cart to an order
    const response = await validateOpenAPIRoute(
      "post",
      "/cart/convert",
      undefined,
      {},
    );
    expect(response.data).toBeDefined();
    expect(response.data.id).toBeDefined();
    expect(response.data.items).toBeArray();
  });

});
