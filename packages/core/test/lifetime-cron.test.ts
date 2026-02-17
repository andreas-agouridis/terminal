import { describe, expect } from "bun:test";
import { and, desc, eq } from "drizzle-orm";
import { Address } from "../src/address";
import { useTransaction } from "../src/drizzle/transaction";
import { Order } from "../src/order/order";
import { orderItemTable, orderTable } from "../src/order/order.sql";
import { Product } from "../src/product";
import { LifetimeCron } from "../src/subscription/lifetime-cron";
import { lifetimeCronSubscriptionTable } from "../src/subscription/lifetime-cron.sql";
import { withTestUser } from "./util";

async function createCronVariant() {
  const productID = await Product.create({
    name: "cron",
    description: "test cron product",
  });

  return Product.addVariant({
    productID,
    name: "test cron variant",
    price: 1000,
  });
}

async function createNonCronVariant() {
  const productID = await Product.create({
    name: "coffee-test",
    description: "test coffee product",
  });

  return Product.addVariant({
    productID,
    name: "test coffee variant",
    price: 1200,
  });
}

async function createAddress() {
  return Address.create({
    name: "Test User",
    street1: "2800 SW 28th Terrace",
    city: "Miami",
    country: "US",
    zip: "33133",
    province: "FL",
  });
}

describe("lifetime cron", () => {
  withTestUser("createComped rejects non-cron variants", async () => {
    const productVariantID = await createNonCronVariant();
    const addressID = await createAddress();

    await expect(
      Order.createComped({
        addressID,
        variants: {
          [productVariantID]: 1,
        },
      }),
    ).rejects.toBeDefined();
  });

  withTestUser("create + cancel", async () => {
    const productVariantID = await createCronVariant();
    const addressID = await createAddress();

    const id = await LifetimeCron.create({
      productVariantID,
      quantity: 2,
      addressID,
    });

    const created = await LifetimeCron.fromID(id);
    expect(created).toBeDefined();
    expect(created!.productVariantID).toBe(productVariantID);
    expect(created!.quantity).toBe(2);
    expect(created!.addressID).toBe(addressID);
    expect(created!.next).toBeUndefined();

    await LifetimeCron.cancel(id);

    const row = await useTransaction((tx) =>
      tx
        .select({
          timeDeleted: lifetimeCronSubscriptionTable.timeDeleted,
        })
        .from(lifetimeCronSubscriptionTable)
        .where(eq(lifetimeCronSubscriptionTable.id, id))
        .limit(1)
        .then((rows) => rows[0]),
    );
    expect(row?.timeDeleted).toBeDefined();
  });

  withTestUser("process creates comped order and clears next", async (userID) => {
    const productVariantID = await createCronVariant();
    const addressID = await createAddress();

    const id = await LifetimeCron.create({
      productVariantID,
      quantity: 3,
      addressID,
    });

    await useTransaction((tx) =>
      tx
        .update(lifetimeCronSubscriptionTable)
        .set({
          timeNext: new Date(Date.now() - 24 * 60 * 60 * 1000),
        })
        .where(eq(lifetimeCronSubscriptionTable.id, id)),
    );

    await LifetimeCron.process();

    const subRow = await useTransaction((tx) =>
      tx
        .select({
          timeNext: lifetimeCronSubscriptionTable.timeNext,
          timeDeleted: lifetimeCronSubscriptionTable.timeDeleted,
        })
        .from(lifetimeCronSubscriptionTable)
        .where(eq(lifetimeCronSubscriptionTable.id, id))
        .limit(1)
        .then((rows) => rows[0]),
    );
    expect(subRow?.timeDeleted).toBeNull();
    expect(subRow?.timeNext).toBeNull();

    const orderRow = await useTransaction((tx) =>
      tx
        .select({
          orderID: orderTable.id,
          shippingAmount: orderTable.shippingAmount,
          itemAmount: orderItemTable.amount,
          quantity: orderItemTable.quantity,
        })
        .from(orderTable)
        .innerJoin(orderItemTable, eq(orderTable.id, orderItemTable.orderID))
        .where(
          and(
            eq(orderTable.userID, userID),
            eq(orderItemTable.productVariantID, productVariantID),
          ),
        )
        .orderBy(desc(orderTable.id))
        .limit(1)
        .then((rows) => rows[0]),
    );

    expect(orderRow).toBeDefined();
    expect(orderRow!.shippingAmount).toBe(0);
    expect(orderRow!.itemAmount).toBe(0);
    expect(orderRow!.quantity).toBe(3);
  });
});
