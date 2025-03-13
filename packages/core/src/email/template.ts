import { useTransaction } from "@terminal/core/drizzle/transaction";
import { userTable } from "../user/user.sql";
import { orderTable, orderItemTable } from "../order/order.sql";
import { and, count, eq, lt, sql } from "drizzle-orm";
import { Email } from "./index";
import { productTable, productVariantTable } from "../product/product.sql";
import { giftCardTable } from "../giftcard/giftcard.sql";

export module Template {
  export async function sendOrderConfirmation(orderID: string) {
    const items = await useTransaction((tx) =>
      tx
        .select({
          email: orderTable.email,
          name: userTable.name,
          trackingUrl: orderTable.trackingURL,
          shippingCost: orderTable.shippingAmount,
          shippingAddress: orderTable.shippingAddress,
          productName: productTable.name,
          variantName: productVariantTable.name,
          quantity: orderItemTable.quantity,
          amount: orderItemTable.amount,
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
      `• ${i.quantity}x ${i.productName} (${i.variantName}) $${(i.amount / 100).toFixed(2)}`;
    const index = order.index.toString().padStart(3, "0");
    const body = [
      `Dear {valued_customer_name},`,
      ``,
      `Thank you for ordering from Terminal!`,
      `We're working on packing and shipping your coffee as you read this.`,
      ``,
      `Here's a tracking URL that definitely won't work, yet:`,
      `${order.trackingUrl}`,
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
      `p.s. No HTML tags were released into the atmosphere producing this 100% organic, css-free, plain text email`,
    ].join("\n");

    await Email.send("order", order.email!, `Terminal Order #${index}`, body);
  }

  export async function sendGiftCardCode(giftCardID: string) {
    const giftCard = await useTransaction((tx) =>
      tx
        .select({
          id: giftCardTable.id,
          value: giftCardTable.value,
          recipientEmail: giftCardTable.recipientEmail,
          orderID: giftCardTable.orderID,
          purchaserName: userTable.name,
          purchaserEmail: orderTable.email,
        })
        .from(giftCardTable)
        .leftJoin(orderTable, eq(giftCardTable.orderID, orderTable.id))
        .leftJoin(userTable, eq(orderTable.userID, userTable.id))
        .where(eq(giftCardTable.id, giftCardID))
        .then((rows) => rows[0]),
    );

    if (!giftCard || !giftCard.recipientEmail) {
      console.log("No gift card found for ID", giftCardID);
      return;
    }

    const dollarValue = (giftCard.value / 100).toFixed(2);
    const body = [
      `Hello from Terminal!`,
      ``,
      `${giftCard.purchaserName ? `${giftCard.purchaserName} sent you` : "You've received"} a $${dollarValue} gift card to use at Terminal.`,
      ``,
      `Gift Card Code: ${giftCard.id}`,
      `Amount: $${dollarValue}`,
      ``,
      `To redeem your gift card, simply enter this code during checkout at our Terminal shop.`,
      "You can access the Terminal shop via SSH: `ssh terminal.shop` and if that's confusing, visit https://terminal.shop/docs.",
      ``,
      `Enjoy!`,
      `The Terminal Team`,
      ``,
      `p.s. No HTML tags were released into the atmosphere producing this 100% organic, css-free, plain text email`,
    ].join("\n");

    await Email.send(
      "support",
      giftCard.recipientEmail,
      `Your Terminal Gift Card`,
      body,
      giftCard.purchaserEmail || undefined,
    );
  }
}
