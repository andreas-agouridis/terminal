import { describe, expect } from "bun:test";
import {
  getTestAddressID,
  getTestCardID,
  getTestProductVariantID,
  getTestSubscriptionID,
  setupApiTest,
} from "./util";
import { Examples } from "@terminal/core/examples";
import { Subscription } from "@terminal/core/subscription/subscription";
import { ErrorCodes } from "@terminal/core/error";

const { test, validateOpenAPIRoute, post, expectError } = setupApiTest();

describe("subscription", () => {
  test("GET /subscription", async () => {
    const response = await validateOpenAPIRoute("get", "/subscription");
    expect(response.data).toBeArray();
  });

  test("GET /subscription/:id", async () => {
    const productVariantID = await getTestProductVariantID();
    const addressID = await getTestAddressID();
    const cardID = await getTestCardID();
    const subscriptionID = await Subscription.create({
      addressID,
      cardID,
      productVariantID,
      quantity: Examples.Subscription.quantity,
      schedule: Examples.Subscription.schedule,
    });
    const response = await validateOpenAPIRoute("get", "/subscription/:id", {
      id: subscriptionID,
    });
    expect(response.data.id).toBe(subscriptionID);
  });

  test("POST /subscription", async () => {
    const productVariantID = await getTestProductVariantID();
    const addressID = await getTestAddressID();
    const cardID = await getTestCardID();

    const subscriptionData = {
      addressID,
      cardID,
      productVariantID,
      quantity: Examples.Subscription.quantity,
      schedule: Examples.Subscription.schedule,
    };

    const response = await validateOpenAPIRoute(
      "post",
      "/subscription",
      undefined,
      subscriptionData,
    );
    expect(response.data).toBeDefined();

    // Verify the subscription was created
    const subscriptions = await Subscription.list();
    expect(
      subscriptions.some(
        (sub) =>
          sub.productVariantID === productVariantID &&
          sub.quantity === Examples.Subscription.quantity &&
          sub.addressID === addressID &&
          sub.cardID === cardID,
      ),
    ).toBe(true);
  });

  test("POST /subscription rejects negative quantity", async () => {
    const productVariantID = await getTestProductVariantID();
    const addressID = await getTestAddressID();
    const cardID = await getTestCardID();

    const res = await post("/subscription", {
      addressID,
      cardID,
      productVariantID,
      quantity: -1,
      schedule: Examples.Subscription.schedule,
    });
    await expectError(res, 400, ErrorCodes.Validation.INVALID_PARAMETER);
  });

  test("POST /subscription rejects zero quantity", async () => {
    const productVariantID = await getTestProductVariantID();
    const addressID = await getTestAddressID();
    const cardID = await getTestCardID();

    const res = await post("/subscription", {
      addressID,
      cardID,
      productVariantID,
      quantity: 0,
      schedule: Examples.Subscription.schedule,
    });
    await expectError(res, 400, ErrorCodes.Validation.INVALID_PARAMETER);
  });

  test("PUT /subscription/:id", async () => {
    const subscriptionData = {
      schedule: { type: "weekly" as const, interval: 5 },
    };

    const subscriptionID = await getTestSubscriptionID();

    const response = await validateOpenAPIRoute(
      "put",
      "/subscription/:id",
      { id: subscriptionID },
      subscriptionData,
    );

    expect(response.data).toBeDefined();
    expect(response.data.schedule).toBeDefined();
    expect(response.data.schedule.interval).toBe(
      subscriptionData.schedule.interval,
    );

    // Verify the subscription was actually updated in the database
    const subscriptionId = response.data.id;
    const subscription = await Subscription.fromID(subscriptionId);
    expect(subscription).toBeDefined();
    expect(subscription!.schedule).toBeDefined();
    expect(subscription!.schedule!.type).toBe("weekly");
    // @ts-expect-error
    expect(subscription!.schedule!.interval).toBe(
      subscriptionData.schedule.interval,
    );

    // Reset to original values to clean up
    await Subscription.update({
      id: subscriptionId,
      schedule: Examples.Subscription.schedule,
    });
  });

  test("DELETE /subscription/:id", async () => {
    const productVariantID = await getTestProductVariantID();
    const addressID = await getTestAddressID();
    const cardID = await getTestCardID();
    const subscriptionID = await Subscription.create({
      addressID,
      cardID,
      productVariantID,
      quantity: Examples.Subscription.quantity,
      schedule: Examples.Subscription.schedule,
    });

    // Delete the subscription
    await validateOpenAPIRoute("delete", "/subscription/:id", {
      id: subscriptionID,
    });
    const deleted = await Subscription.fromID(subscriptionID);
    expect(deleted).toBeUndefined();
  });
});
