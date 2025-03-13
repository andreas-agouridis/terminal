import { describe, expect } from "bun:test";
import {
  getTestAddressID,
  getTestCardID,
  getTestProductVariantID,
  getTestGiftCard,
  setupApiTest,
} from "./util";
import { Examples } from "@terminal/core/examples";
import { Cart } from "@terminal/core/cart/index";
import { GiftCard } from "@terminal/core/giftcard/index";

const { test, validateOpenAPIRoute } = setupApiTest();

describe("cart", () => {
  test("GET /cart", async () => {
    const response = await validateOpenAPIRoute("get", "/cart");
    expect(response.data).toBeDefined();
    expect(response.data.items).toBeArray();
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

  test("PUT /cart/gift-card", async () => {
    // First create a gift card to test with
    const giftCard = await getTestGiftCard(1000); // $10 gift card

    // Set up a cart
    const productVariantID = await getTestProductVariantID();
    await Cart.setItem({
      productVariantID: productVariantID,
      quantity: 1,
    });

    // Apply the gift card to the cart
    const response = await validateOpenAPIRoute(
      "put",
      "/cart/gift-card",
      undefined,
      {
        giftCardID: giftCard,
      },
    );

    expect(response.data).toBeDefined();
    expect(response.data.giftCardID).toBe(giftCard);
    expect(response.data.appliedAmount).toBeNumber();
    expect(response.data.remainingBalance).toBeNumber();

    // Verify gift card was applied - check the cart
    const cart = await Cart.get();
    expect(cart.giftCardID).toBe(giftCard);
    expect(cart.amount.giftCard).toBeDefined();
  });

  test("DELETE /cart/gift-card", async () => {
    // First create a gift card and apply it
    const giftCard = await getTestGiftCard(1000);
    await Cart.redeemGiftCard(giftCard);

    // Now remove it
    const response = await validateOpenAPIRoute("delete", "/cart/gift-card");
    expect(response.data).toBe("ok");

    // Verify gift card was removed - check the cart
    const cart = await Cart.get();
    expect(cart.giftCardID).toBeUndefined();
    expect(cart.amount.giftCard).toBeUndefined();

    // Verify gift card has original balance
    const gc = await GiftCard.fromID(giftCard);
    expect(gc?.balance).toBe(1000);
  });
});
