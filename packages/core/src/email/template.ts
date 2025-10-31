import { useTransaction } from "@terminal/core/drizzle/transaction";
import { userTable } from "../user/user.sql";
import { orderTable, orderItemTable } from "../order/order.sql";
import { and, count, eq, lt, sql } from "drizzle-orm";
import { Email } from "./index";
import { productTable, productVariantTable } from "../product/product.sql";
import { subscriptionTable } from "../subscription/subscription.sql";
import { addressTable } from "../address/address.sql";
import { DateTime } from "luxon";
import type { SubscriptionSchedule } from "../subscription/subscription.sql";

const ps = `p.s. No HTML tags were released into the atmosphere producing this 100% organic, css-free, plain text email`;

type SubscriptionData = {
  email: string | null;
  name: string | null;
  productName: string;
  variantName: string;
  quantity: number;
  schedule: SubscriptionSchedule | null;
  addressID: string;
};

async function getSubscriptionData(
  subscriptionID: string,
): Promise<SubscriptionData | null> {
  const result = await useTransaction((tx) =>
    tx
      .select({
        email: userTable.email,
        name: userTable.name,
        productName: productTable.name,
        variantName: productVariantTable.name,
        quantity: subscriptionTable.quantity,
        schedule: subscriptionTable.schedule,
        addressID: subscriptionTable.addressID,
      })
      .from(subscriptionTable)
      .innerJoin(userTable, eq(userTable.id, subscriptionTable.userID))
      .innerJoin(
        productVariantTable,
        eq(productVariantTable.id, subscriptionTable.productVariantID),
      )
      .innerJoin(
        productTable,
        eq(productTable.id, productVariantTable.productID),
      )
      .where(eq(subscriptionTable.id, subscriptionID))
      .limit(1)
      .then((rows) => rows[0]),
  );
  return result || null;
}

async function getAddress(addressID: string) {
  return await useTransaction((tx) =>
    tx
      .select()
      .from(addressTable)
      .where(eq(addressTable.id, addressID))
      .limit(1)
      .then((rows) => rows[0]),
  );
}

function formatNextDeliveryDate(
  schedule: SubscriptionSchedule | null,
): string {
  if (schedule?.type === "weekly") {
    return (
      "on " +
      DateTime.now()
        .plus({ weeks: schedule.interval })
        .toFormat("MMMM d, yyyy")
    );
  }
  return "soon";
}

function formatAddress(address: {
  address: {
    name: string;
    street1: string;
    street2?: string | null;
    city: string;
    province?: string;
    zip: string;
    country: string;
  };
}): string {
  return [
    address.address.name,
    address.address.street1 +
      (address.address.street2 ? "\n" + address.address.street2 : ""),
    `${address.address.city}, ${address.address.province || ""} ${address.address.zip} ${address.address.country}`,
  ].join("\n");
}

function getGreeting(name: string | null): string {
  return name ? `Dear ${name},` : `Dear Customer,`;
}

export namespace Template {
  export async function sendSubscriptionConfirmation(subscriptionID: string) {
    const data = await getSubscriptionData(subscriptionID);
    if (!data || !data.email) return;

    const isCron = data.productName.toLowerCase().includes("cron");

    if (isCron) {
      await sendCronSubscriptionConfirmation(subscriptionID, data);
    } else {
      await sendCoffeeSubscriptionConfirmation(subscriptionID, data);
    }
  }

  async function sendCronSubscriptionConfirmation(
    subscriptionID: string,
    data: SubscriptionData,
  ) {
    if (!data.email) return;
    const address = await getAddress(data.addressID);
    if (!address) return;

    const nextDate = formatNextDeliveryDate(data.schedule);
    const greeting = getGreeting(data.name);

    const body = [
      greeting,
      ``,
      `You're now a member of Cron, which is a pretty big deal. You're in the club. One of us. Legend.`,
      ``,
      `Your first delivery will arrive ${nextDate}.`,
      ``,
      `Shipping Address:`,
      formatAddress(address),
      ``,
      ps,
    ].join("\n");

    await Email.send("order", data.email, `Welcome to Cron`, body);
  }

  async function sendCoffeeSubscriptionConfirmation(
    subscriptionID: string,
    data: SubscriptionData,
  ) {
    if (!data.email) return;
    const address = await getAddress(data.addressID);
    if (!address) return;

    const nextDate = formatNextDeliveryDate(data.schedule);
    const greeting = getGreeting(data.name);

    const body = [
      greeting,
      ``,
      `Thank you for subscribing to Terminal Coffee!`,
      ``,
      `Subscription Details:`,
      `• ${data.quantity}x ${data.productName} (${data.variantName})`,
      `• Delivery: ${data.schedule?.type === "weekly" ? `Every ${data.schedule.interval} week(s)` : "One-time"}`,
      ``,
      `Your first delivery will arrive ${nextDate}.`,
      ``,
      `Shipping Address:`,
      formatAddress(address),
      ``,
      ps,
    ].join("\n");

    await Email.send(
      "order",
      data.email,
      `Terminal Coffee Subscription Confirmed`,
      body,
    );
  }

  export async function sendOrderConfirmation(orderID: string) {
    const items = await useTransaction((tx) =>
      tx
        .select({
          email: orderTable.email,
          name: userTable.name,
          shippingCost: orderTable.shippingAmount,
          shippingAddress: orderTable.shippingAddress,
          productName: productTable.name,
          variantName: productVariantTable.name,
          quantity: orderItemTable.quantity,
          amount: orderItemTable.amount,
          subscriptionID: orderItemTable.subscriptionID,
          index: sql<string>`${tx
            .select({ index: count() })
            .from(orderTable)
            .where(
              and(
                eq(orderTable.userID, userTable.id),
                lt(orderTable.id, orderID),
              ),
            )}`,
        })
        .from(orderTable)
        .leftJoin(userTable, eq(userTable.id, orderTable.userID))
        .innerJoin(orderItemTable, eq(orderItemTable.orderID, orderTable.id))
        .innerJoin(
          productVariantTable,
          eq(productVariantTable.id, orderItemTable.productVariantID),
        )
        .innerJoin(
          productTable,
          eq(productTable.id, productVariantTable.productID),
        )
        .where(eq(orderTable.id, orderID)),
    );
    const order = items[0];
    if (!order) return;
    if (!order?.email) return;

    const subtotal = items.reduce((acc, i) => acc + i.amount, 0) / 100;
    const shipping = order.shippingCost / 100;
    const total = subtotal + shipping;
    const formatItem = (i: typeof order) =>
      `• ${i.quantity}x ${i.productName} (${i.variantName}) $${(i.amount / 100).toFixed(2)} ${i.subscriptionID ? "(Subscription)" : ""}`;
    const index = order.index.toString().padStart(3, "0");
    const subscription = items.some((i) => i.subscriptionID);
    const greeting = order.name ? `Dear ${order.name},` : `Dear Customer,`;

    const body = [
      greeting,
      ``,
      `Thank you for ${subscription ? "subscribing to" : "ordering"} Terminal coffee!`,
      ``,
      `Your coffee will be shipped within 24 hours of roasting. We'll send you another email with tracking information once your order has shipped.`,
      ``,
      `Order #${index} (zero-indexed btw)`,
      ``,
      `Items:`,
      ...items.map(formatItem),
      ``,
      `Subtotal: $${subtotal.toFixed(2)}`,
      `Shipping: $${shipping.toFixed(2)}`,
      `Total: $${total.toFixed(2)}`,
      ``,
      `Shipping Address:`,
      `${order.shippingAddress.name}`,
      `${order.shippingAddress.street1 + (order.shippingAddress.street2 ? "\n" + order.shippingAddress.street2 : "")}`,
      `${order.shippingAddress.city}, ${order.shippingAddress.province} ${order.shippingAddress.zip} ${order.shippingAddress.country}`,
      ``,
      ps,
    ].join("\n");

    await Email.send("order", order.email!, `Terminal Order #${index}`, body);
  }

  export async function sendOrderShipped(orderID: string) {
    const data = await useTransaction((tx) =>
      tx
        .select({
          email: orderTable.email,
          name: userTable.name,
          trackingUrl: orderTable.trackingURL,
          trackingNumber: orderTable.trackingNumber,
          trackingStatus: orderTable.trackingStatus,
          trackingStatusDetails: orderTable.trackingStatusDetails,
          shippingAddress: orderTable.shippingAddress,
          index: sql<string>`${tx
            .select({ index: count() })
            .from(orderTable)
            .where(
              and(
                eq(orderTable.userID, userTable.id),
                lt(orderTable.id, orderID),
              ),
            )}`,
        })
        .from(orderTable)
        .leftJoin(userTable, eq(userTable.id, orderTable.userID))
        .where(eq(orderTable.id, orderID))
        .limit(1)
        .then((rows) => rows[0]),
    );

    if (!data || !data.email) return;

    const index = data.index.toString().padStart(3, "0");
    const greeting = data.name ? `Dear ${data.name},` : `Dear Customer,`;

    const body = [
      greeting,
      ``,
      `Great news! Your Terminal coffee order (#${index}) has shipped and is on its way to you.`,
      ``,
      `Your roast date is ${new Date().toDateString()}`,
      ``,
      `Tracking Number: ${data.trackingNumber || "Not available"}`,
      `Tracking URL: ${data.trackingUrl || "Not available"}`,
      `Status: ${data.trackingStatus || "In Transit"}`,
      `${data.trackingStatusDetails ? `Details: ${data.trackingStatusDetails}` : ""}`,
      ``,
      `Shipping Address:`,
      `${data.shippingAddress.name}`,
      `${data.shippingAddress.street1 + (data.shippingAddress.street2 ? "\n" + data.shippingAddress.street2 : "")}`,
      `${data.shippingAddress.city}, ${data.shippingAddress.province} ${data.shippingAddress.zip} ${data.shippingAddress.country}`,
      ``,
      ps,
    ].join("\n");

    await Email.send(
      "order",
      data.email,
      `Your Terminal Order #${index} Has Shipped`,
      body,
    );
  }

  export async function sendSubscriptionFailed(subscriptionID: string) {
    const data = await useTransaction((tx) =>
      tx
        .select({
          email: userTable.email,
          name: userTable.name,
          productName: productTable.name,
          variantName: productVariantTable.name,
          quantity: subscriptionTable.quantity,
          schedule: subscriptionTable.schedule,
          addressID: subscriptionTable.addressID,
        })
        .from(subscriptionTable)
        .innerJoin(userTable, eq(userTable.id, subscriptionTable.userID))
        .innerJoin(
          productVariantTable,
          eq(productVariantTable.id, subscriptionTable.productVariantID),
        )
        .innerJoin(
          productTable,
          eq(productTable.id, productVariantTable.productID),
        )
        .where(eq(subscriptionTable.id, subscriptionID))
        .limit(1)
        .then((rows) => rows[0]),
    );

    if (!data || !data.email) return;

    const greeting = data.name ? `Dear ${data.name},` : `Dear Customer,`;

    const body = [
      greeting,
      ``,
      `We encountered an issue processing your Terminal Coffee subscription and were unable to complete your order.`,
      ``,
      `Subscription Details:`,
      `• ${data.quantity}x ${data.productName} (${data.variantName})`,
      `• Delivery: ${data.schedule?.type === "weekly" ? `Every ${data.schedule.interval} week(s)` : "One-time"}`,
      ``,
      `This could be due to:`,
      `• Payment method issues (expired card, insufficient funds, etc.)`,
      `• Shipping address problems`,
      `• Product availability`,
      ``,
      `To resolve this issue, please reply to this email or contact us with any updates needed for your subscription, including:`,
      `• Updated payment information`,
      `• Corrected shipping address`,
      `• Any other changes to your subscription`,
      ``,
      `We'll retry processing your subscription once we hear from you.`,
      ``,
      ps,
    ].join("\n");

    await Email.send(
      "order",
      data.email,
      `Issue Processing Your Terminal Coffee Subscription`,
      body,
    );
  }
}
