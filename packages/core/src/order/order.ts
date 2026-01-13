import {
  afterTx,
  createTransaction,
  useTransaction,
} from "../drizzle/transaction";
import { createID } from "../util/id";
import { orderItemTable, orderTable } from "./order.sql";
import { Actor } from "../actor";
import { userTable } from "../user/user.sql";
import {
  and,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  sql,
  sum,
  desc,
  or,
} from "drizzle-orm";
import { cartItemTable, cartTable } from "../cart/cart.sql";
import {
  productTable,
  productVariantInventoryTable,
  productVariantTable,
} from "../product/product.sql";
import { z } from "zod";
import { fn } from "../util/fn";
import { cardTable } from "../card/card.sql";
import { defineEvent } from "../event";
import { bus } from "sst/aws/bus";
import { Resource } from "sst";
import { stripe } from "../stripe";
import { Stripe } from "stripe";
import { Shippo } from "../shippo/index";
import { ErrorCodes, VisibleError } from "../error";
import { inventoryRecordTable } from "../inventory/inventory.sql";
import { pipe, groupBy, values, map } from "remeda";
import { Common } from "../common";
import { Examples } from "../examples";
import { Address } from "../address";
import { AddressInner } from "../address/schema";
import { addressTable } from "../address/address.sql";
import { ProductFilter } from "../product/filter";
import { Log } from "../util/log";
import { Shipping } from "../shipping";

export namespace Order {
  const log = Log.create({ namespace: "order" });
  export const Item = z
    .object({
      id: z.string().openapi({
        description: Common.IdDescription,
        example: Examples.OrderItem.id,
      }),
      description: z.string().optional().openapi({
        description: "Description of the item in the order.",
      }),
      amount: z.number().int().openapi({
        description: "Amount of the item in the order, in cents (USD).",
        example: Examples.OrderItem.amount,
      }),
      quantity: z.number().int().min(1).openapi({
        description: "Quantity of the item in the order.",
        example: Examples.OrderItem.quantity,
      }),
      productVariantID: z.string().optional().openapi({
        description: "ID of the product variant of the item in the order.",
        example: Examples.OrderItem.productVariantID,
      }),
    })
    .openapi({ ref: "OrderItem", example: Examples.OrderItem });

  export const TrackingStatus = z.enum([
    "PRE_TRANSIT",
    "TRANSIT",
    "DELIVERED",
    "RETURNED",
    "FAILURE",
    "UNKNOWN",
  ]);

  export type TrackingStatus = z.infer<typeof TrackingStatus>;

  export const TrackingInfo = z.object({
    trackingNumber: z.string(),
    carrier: z.string(),
    status: TrackingStatus,
    statusDetails: z.string().optional(),
    statusDate: z.string(),
    metadata: z.string().optional(),
  });

  export type TrackingInfo = z.infer<typeof TrackingInfo>;

  export const Info = z
    .object({
      id: z.string().openapi({
        description: Common.IdDescription,
        example: Examples.Order.id,
      }),
      index: z.number().int().optional().openapi({
        description: "Zero-based index of the order for this user only.",
        example: Examples.Order.index,
      }),
      shipping: AddressInner.openapi({
        description: "Shipping address of the order.",
        example: Examples.Order.shipping,
      }),
      created: z.coerce.date().openapi({
        description: "Date the order was created.",
        example: Examples.Order.created,
      }),
      amount: z
        .object({
          shipping: z.number().int().openapi({
            description: "Shipping amount of the order, in cents (USD).",
            example: Examples.Order.amount.shipping,
          }),
          subtotal: z.number().int().openapi({
            description: "Subtotal amount of the order, in cents (USD).",
            example: Examples.Order.amount.subtotal,
          }),
        })
        .openapi({
          description: "The subtotal and shipping amounts of the order.",
          example: Examples.Order.amount,
        }),
      tracking: z
        .object({
          service: z.string().optional().openapi({
            description: "Shipping service of the order.",
            example: Examples.Order.tracking.service,
          }),
          number: z.string().optional().openapi({
            description: "Tracking number of the order.",
            example: Examples.Order.tracking.number,
          }),
          url: z.string().optional().openapi({
            description: "Tracking URL of the order.",
            example: Examples.Order.tracking.url,
          }),
          status: TrackingStatus.optional().openapi({
            description: "Current tracking status of the shipment.",
            example: Examples.Order.tracking.status,
          }),
          statusDetails: z.string().optional().openapi({
            description: "Additional details about the tracking status.",
            example: Examples.Order.tracking.statusDetails,
          }),
          statusUpdatedAt: z.coerce.date().optional().openapi({
            description: "When the tracking status was last updated.",
            example: Examples.Order.tracking.statusUpdatedAt,
          }),
        })
        .openapi({
          description: "Tracking information of the order.",
          example: Examples.Order.tracking,
        }),
      items: Item.array().openapi({
        description: "Items in the order.",
        example: Examples.Order.items,
      }),
    })
    .openapi({
      ref: "Order",
      description: "An order from the Terminal shop.",
      example: Examples.Order,
    });

  export type Info = z.infer<typeof Info>;

  export const Event = {
    Created: defineEvent(
      "order.created",
      z.object({
        orderID: Info.shape.id,
      }),
    ),
    TrackingStatusChanged: defineEvent(
      "order.tracking_status_changed",
      z.object({
        orderID: Info.shape.id,
        previousStatus: TrackingStatus.optional(),
        newStatus: TrackingStatus,
      }),
    ),
  };

  /**
   * Calculate total weight in ounces for a set of variant items.
   * Used by Order.create and Order.createInternal to get accurate weights for shipping.
   */
  export const calculateTotalWeight = fn(
    z.record(z.number().int().min(1)),
    async (variants) => {
      if (Object.keys(variants).length === 0) return 0;
      const rows = await useTransaction(async (tx) =>
        tx
          .select({
            id: productVariantTable.id,
            weight: productVariantTable.weight,
          })
          .from(productVariantTable)
          .where(inArray(productVariantTable.id, Object.keys(variants))),
      );
      return rows.reduce(
        (total, row) => total + row.weight * (variants[row.id] ?? 0),
        0,
      );
    },
  );

  export const list = () =>
    useTransaction(async (tx) => {
      const rows = await tx
        .select()
        .from(orderTable)
        .innerJoin(cartTable, eq(orderTable.userID, cartTable.userID))
        .leftJoin(orderItemTable, eq(orderTable.id, orderItemTable.orderID))
        .leftJoin(
          productVariantTable,
          eq(orderItemTable.productVariantID, productVariantTable.id),
        )
        .where(eq(orderTable.userID, Actor.userID()))
        .orderBy(desc(orderTable.id));
      const result = pipe(
        rows,
        groupBy((x) => x.order.id),
        values(),
        map(
          (group): Info => ({
            id: group[0].order.id,
            // index: group[0].order.index,
            shipping: group[0].order.shippingAddress,
            created: group[0].order.timeCreated,
            amount: {
              shipping: group[0].order.shippingAmount,
              subtotal: group.reduce(
                (acc, row) => acc + row.order_item!.amount,
                0,
              ),
            },
            tracking: {
              service: group[0].cart.shippingService || undefined,
              number: group[0].order.trackingNumber || undefined,
              url: group[0].order.trackingURL || undefined,
              status: group[0].order.trackingStatus || undefined,
              statusDetails: group[0].order.trackingStatusDetails || undefined,
              statusUpdatedAt:
                group[0].order.trackingStatusUpdatedAt || undefined,
            },
            items: group.map((row) => ({
              id: row.order_item!.id,
              amount: row.order_item!.amount,
              quantity: row.order_item!.quantity,
              productVariantID: row.order_item!.productVariantID!,
            })),
          }),
        ),
      );
      return result as Info[];
    });

  export const fromID = fn(Info.shape.id, (input) =>
    useTransaction((tx) =>
      tx
        .select()
        .from(orderTable)
        .innerJoin(orderItemTable, eq(orderTable.id, orderItemTable.orderID))
        .leftJoin(
          productVariantTable,
          eq(orderItemTable.productVariantID, productVariantTable.id),
        )
        .where(and(eq(orderTable.id, input), eq(orderTable.userID, Actor.userID())))
        .then((rows): Info | undefined =>
          rows.length === 0
            ? undefined
            : {
              id: rows[0]!.order.id,
              shipping: rows[0]!.order.shippingAddress,
              created: rows[0]!.order.timeCreated,
              amount: {
                shipping: rows[0]!.order.shippingAmount,
                subtotal: rows.reduce(
                  (acc, row) => acc + row.order_item.amount,
                  0,
                ),
              },
              tracking: {
                number: rows[0]!.order.trackingNumber || undefined,
                url: rows[0]!.order.trackingURL || undefined,
                status: rows[0]!.order.trackingStatus || undefined,
                statusDetails:
                  rows[0]!.order.trackingStatusDetails || undefined,
                statusUpdatedAt:
                  rows[0]!.order.trackingStatusUpdatedAt || undefined,
              },
              items: rows.map((row) => ({
                id: row.order_item.id,
                amount: row.order_item.amount,
                quantity: row.order_item.quantity,
                productVariantID: row.product_variant?.id,
              })),
            },
        ),
    ),
  );

  export async function convertCart() {
    log.info("converting cart");
    const userID = Actor.userID();
    const { items, cart } = await useTransaction(async (tx) => {
      const items = await tx
        .select()
        .from(cartItemTable)
        .where(eq(cartItemTable.userID, userID));
      const cart = await tx
        .select()
        .from(cartTable)
        .where(eq(cartTable.userID, userID))
        .then((rows) => rows[0]);
      return { items, cart };
    });
    if (!cart?.addressID)
      throw new VisibleError(
        "validation",
        ErrorCodes.Validation.MISSING_REQUIRED_FIELD,
        "No shipping address added to cart.",
      );
    if (!cart?.cardID)
      throw new VisibleError(
        "validation",
        ErrorCodes.Validation.MISSING_REQUIRED_FIELD,
        "No card added to cart.",
      );
    const validItems = items.filter((item) => item.quantity > 0);
    if (validItems.length === 0) {
      throw new VisibleError(
        "validation",
        ErrorCodes.Validation.INVALID_PARAMETER,
        "No items in cart.",
      );
    }
    const orderID = await create({
      addressID: cart.addressID,
      cardID: cart.cardID,
      variants: validItems.reduce(
        (acc, item) => {
          acc[item.productVariantID] = item.quantity;
          return acc;
        },
        {} as Record<string, number>,
      ),
    });
    await createTransaction(async (tx) => {
      await tx.delete(cartItemTable).where(eq(cartItemTable.userID, userID));
    });
    return orderID;
  }

  export const create = fn(
    z.object({
      cardID: z.string(),
      addressID: z.string(),
      variants: z.record(z.number().int().min(1)),
      prices: z.record(z.number().int()).optional(), // price overrides, used for subscriptions
    }),
    async (input) => {
      log.info("creating order");
      const userID = Actor.userID();
      if (Object.keys(input.variants).length === 0) {
        throw new VisibleError(
          "validation",
          ErrorCodes.Validation.INVALID_PARAMETER,
          "No items in order",
        );
      }
      const match = await useTransaction(async (tx) =>
        tx
          .select({
            shipping: addressTable.address,
            card: getTableColumns(cardTable),
            stripeCustomerID: userTable.stripeCustomerID,
            email: userTable.email,
          })
          .from(userTable)
          .innerJoin(addressTable, eq(addressTable.id, input.addressID))
          .innerJoin(cardTable, eq(cardTable.id, input.cardID))
          .where(eq(userTable.id, userID))
          .then((rows) => rows[0]),
      );
      if (!match)
        throw new VisibleError(
          "validation",
          ErrorCodes.Validation.INVALID_PARAMETER,
          "Card or address not found.",
        );
      const items = await useTransaction(async (tx) =>
        tx
          .select({
            tags: productTable.tags,
            id: productVariantTable.id,
            price: productVariantTable.price,
            productID: productTable.id,
            weight: productVariantTable.weight,
          })
          .from(productVariantTable)
          .where(inArray(productVariantTable.id, Object.keys(input.variants)))
          .innerJoin(
            productTable,
            eq(productVariantTable.productID, productTable.id),
          )
          .then((rows) =>
            rows.map((row) => ({
              id: row.id,
              productID: row.productID,
              tags: row.tags || {},
              price:
                (input.prices?.[row.id] ?? row.price) *
                (input.variants[row.id] ?? 0),
              quantity: input.variants[row.id] ?? 0,
              weight: row.weight * (input.variants[row.id] ?? 0),
            })),
          ),
      );

      const filterCtx = {
        ...ProductFilter.use(),
        region: undefined,
        country: match.shipping.country,
      };
      for (const item of items) {
        if (!ProductFilter.run(filterCtx, item.tags || {}))
          throw new VisibleError(
            "validation",
            ErrorCodes.Validation.INVALID_PARAMETER,
            "This product cannot be purchased.",
          );
      }

      const orderID = createID("order");
      const subtotal = items.reduce((acc, item) => acc + item.price, 0);
      const shipping = await Shipping.calculate(subtotal, match.shipping);
      if (!shipping)
        throw new VisibleError(
          "validation",
          ErrorCodes.Validation.INVALID_PARAMETER,
          "Cannot ship to this address",
        );

      const shippingAmount = shipping.shippingAmount || 0;
      const totalChargeAmount = subtotal + shippingAmount;
      const needsPayment = ![
        "usr_01J1JGH7NH2HZ6DGAGT8SK2KE3", // dax
        "usr_01J1KHKPA8QK82MBHQDBQP78XK", // teej
        "usr_01JG4BDDCKTY6CYWF6JXKVPNNT", // prime
        "usr_01J1JTQHAJZKVSEKZS6P3RYW0K", // adam
        "usr_01JPKFME5A1YMX66Y55YW3WGZ2", // david
        "usr_01JSPVYJ9VAEHX1GB4P4TP04W9", // josh
      ].includes(userID);

      try {
        let result: Stripe.Response<Stripe.PaymentIntent> | undefined;

        // Only create a payment intent if we need to charge the customer
        if (needsPayment) {
          result = await stripe.paymentIntents.create({
            amount: totalChargeAmount,
            automatic_payment_methods: {
              enabled: true,
              allow_redirects: "never",
            },
            confirm: true,
            currency: "usd",
            shipping: {
              name: match.shipping.name,
              address: {
                city: match.shipping.city,
                line1: match.shipping.street1,
                line2: match.shipping.street2,
                postal_code: match.shipping.zip,
                state: match.shipping.province,
                country: match.shipping.country,
              },
            },
            customer: match.stripeCustomerID,
            metadata: {
              orderID,
            },
            payment_method: match.card.stripePaymentMethodID,
          });
        }

        await createTransaction(async (tx) => {
          await tx.insert(orderTable).values({
            id: orderID,
            email: match.email,
            fulfiller: shipping.fulfiller,
            stripePaymentIntentID: result?.id,
            shippingAmount: shipping.shippingAmount || 0,
            shippingAddress: match.shipping,
            card: {
              brand: match.card.brand,
              last4: match.card.last4,
              expiration: {
                month: match.card.expirationMonth,
                year: match.card.expirationYear,
              },
            },
            userID,
          });

          for (const item of items) {
            await tx.insert(orderItemTable).values({
              id: createID("cartItem"),
              amount: item.price,
              productVariantID: item.id,
              quantity: item.quantity,
              orderID,
            });
          }

          await afterTx(() =>
            bus.publish(Resource.Bus, Event.Created, { orderID }),
          );
        });
      } catch (ex) {
        if (ex instanceof Stripe.errors.StripeCardError) {
          throw new VisibleError(
            "validation",
            ErrorCodes.Validation.INVALID_STATE,
            ex.message,
            "cardID",
          );
        }
        log.error(ex as Error);
        throw new VisibleError(
          "internal",
          ErrorCodes.Server.INTERNAL_ERROR,
          "Payment failed.",
        );
      }

      return orderID;
    },
  );

  /**
   * Create an internal/admin order (e.g., via Forge).
   * NOTE: This intentionally sets shippingAmount and item amounts to $0 since these
   * are internal/promo orders. However, we still need accurate weight for Shippo
   * to generate correct shipping labels.
   */
  export const createInternal = fn(
    z.object({
      email: z.string().email(),
      items: z.record(z.number().int().min(1)),
      address: AddressInner,
    }),
    async (input) => {
      await Shippo.assertValidAddress(input.address);

      // Calculate accurate weight for Shippo label generation
      const totalOunces = await calculateTotalWeight(input.items);

      const shippingInfo = await Shippo.createShipmentRate({
        ounces: totalOunces,
        address: input.address,
        subtotal: 0,
      });

      return await useTransaction(async (tx) => {
        // NOTE: Keeping ammounts of cost set to $0, since this is for internal/promo orders.
        //       We eat the cost later when we pay our roasters & shippers.
        const orderID = createID("order");

        await tx.insert(orderTable).values({
          id: orderID,
          email: input.email,
          fulfiller: "qc",
          shippingAmount: 0,
          shippingAddress: input.address,
          shippoRateID: shippingInfo.shippoRateID,
        });

        for (const [productVariantID, quantity] of Object.entries(
          input.items,
        )) {
          if (quantity < 1) throw new Error("Invalid quantity");
          await tx.insert(orderItemTable).values({
            id: createID("cartItem"),
            amount: 0,
            productVariantID,
            quantity,
            orderID,
          });
        }
        await afterTx(() =>
          bus.publish(Resource.Bus, Event.Created, { orderID }),
        );
        return orderID;
      });
    },
  );

  export const setPrinted = fn(Info.shape.id, async (input) => {
    await Actor.assertFlag("printer");
    await useTransaction(async (tx) =>
      tx
        .update(orderTable)
        .set({
          timePrinted: sql`CURRENT_TIMESTAMP(3)`,
        })
        .where(eq(orderTable.id, input)),
    );
  });

  export async function getNextLabel() {
    await Actor.assertFlag("printer");
    const result = await useTransaction((tx) =>
      tx
        .select({
          id: orderTable.id,
          label: orderTable.labelURL,
        })
        .from(orderTable)
        .where(
          and(isNull(orderTable.timePrinted), isNotNull(orderTable.labelURL)),
        )
        .orderBy(orderTable.id)
        .limit(1)
        .then((rows) => rows[0]),
    );
    if (!result) return;
    return result;
  }

  export const setFulfiller = fn(
    z.object({
      orderId: z.string(),
      fulfiller: z.enum(["qc", "lp"]),
    }),
    async (input) => {
      await useTransaction((tx) =>
        tx
          .update(orderTable)
          .set({
            fulfiller: input.fulfiller,
          })
          .where(eq(orderTable.id, input.orderId)),
      );
    },
  );

  export const UpdateInput = z
    .object({
      id: Info.shape.id,
      fulfiller: z.enum(["qc", "lp"]).optional(),
      trackingNumber: z.string().optional(),
      trackingURL: z.string().optional(),
      labelURL: z.string().optional(),
      trackingStatus: TrackingStatus.optional(),
      trackingStatusDetails: z.string().optional(),
      shippoOrderID: z.string().optional(),
      shippoLabelID: z.string().optional(),
      shippoRateID: z.string().optional(),
    })
    .openapi({
      ref: "OrderUpdate",
      description: "Input for updating an order",
    });

  export type UpdateInput = z.infer<typeof UpdateInput>;

  export const update = fn(UpdateInput, async (input) =>
    useTransaction(async (tx) => {
      const order = await tx
        .select({
          id: orderTable.id,
          trackingStatus: orderTable.trackingStatus,
        })
        .from(orderTable)
        .where(
          and(
            eq(orderTable.id, input.id),
            or(
              // If userID is null, then it's a system order, so it's fine.
              isNull(orderTable.userID),

              // Otherwise, check that the userID matches the current user.
              eq(orderTable.userID, Actor.userID()),
            ),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!order) {
        throw new VisibleError(
          "not_found",
          ErrorCodes.NotFound.RESOURCE_NOT_FOUND,
          "Order not found",
        );
      }

      // Build update object with only provided fields
      const updateData: Record<string, any> = {};

      if (input.fulfiller !== undefined) {
        updateData.fulfiller = input.fulfiller;
      }

      if (input.labelURL !== undefined) {
        updateData.labelURL = input.labelURL;
      }

      if (input.trackingNumber !== undefined) {
        updateData.trackingNumber = input.trackingNumber;
      }

      if (input.trackingURL !== undefined) {
        updateData.trackingURL = input.trackingURL;
      }

      if (input.trackingStatus !== undefined) {
        updateData.trackingStatus = input.trackingStatus;
      }

      if (input.trackingStatusDetails !== undefined) {
        updateData.trackingStatusDetails = input.trackingStatusDetails;
      }

      if (input.shippoOrderID !== undefined) {
        updateData.shippoOrderID = input.shippoOrderID;
      }

      if (input.shippoLabelID !== undefined) {
        updateData.shippoLabelID = input.shippoLabelID;
      }

      if (input.shippoRateID !== undefined) {
        updateData.shippoRateID = input.shippoRateID;
      }

      // Only run update if there are fields to update
      if (Object.keys(updateData).length > 0) {
        await tx
          .update(orderTable)
          .set(updateData)
          .where(
            and(
              eq(orderTable.id, input.id),
              eq(orderTable.userID, Actor.userID()),
            ),
          );

        // If tracking status changed, emit event
        if (
          input.trackingStatus !== undefined &&
          order.trackingStatus !== input.trackingStatus
        ) {
          await afterTx(() =>
            bus.publish(Resource.Bus, Event.TrackingStatusChanged, {
              orderID: order.id,
              previousStatus: order.trackingStatus || undefined,
              newStatus: input.trackingStatus!,
            }),
          );
        }
      }

      return true;
    }),
  );

  export const updateTrackingStatus = fn(TrackingInfo, async (data) => {
    const order = await useTransaction((tx) =>
      tx
        .select({
          id: orderTable.id,
          trackingStatus: orderTable.trackingStatus,
        })
        .from(orderTable)
        .where(eq(orderTable.trackingNumber, data.trackingNumber))
        .execute()
        .then((results) => results[0]),
    );

    if (!order) {
      log.warn("tracking update for unknown order", {
        trackingNumber: data.trackingNumber,
      });
      return;
    }

    const previousStatus = order.trackingStatus || undefined;
    const newStatus = data.status;

    // Update the order's tracking status
    await useTransaction((tx) =>
      tx
        .update(orderTable)
        .set({
          trackingStatus: data.status,
          trackingStatusDetails: data.statusDetails || null,
          trackingStatusUpdatedAt: new Date(data.statusDate),
        })
        .where(eq(orderTable.id, order.id))
        .execute(),
    );

    log.info("updated order tracking status", {
      orderID: order.id,
      previousStatus,
      newStatus: data.status,
    });

    // Emit event for tracking status change
    if (previousStatus !== newStatus) {
      await afterTx(() =>
        bus.publish(Resource.Bus, Event.TrackingStatusChanged, {
          orderID: order.id,
          previousStatus,
          newStatus,
        }),
      );
    }

    return order.id;
  });

  export async function trackInventory() {
    await createTransaction(async (tx) => {
      const items = await tx
        .select({
          quantity: sum(orderItemTable.quantity).mapWith(parseInt),
          inventoryID: productVariantInventoryTable.inventoryID,
        })
        .from(orderItemTable)
        .innerJoin(orderTable, eq(orderItemTable.orderID, orderTable.id))
        .innerJoin(
          productVariantInventoryTable,
          eq(
            orderItemTable.productVariantID,
            productVariantInventoryTable.productVariantID,
          ),
        )
        .where(
          and(
            isNull(orderItemTable.timeInventoryTracked),
            isNotNull(orderTable.timePrinted),
          ),
        )
        .groupBy(productVariantInventoryTable.inventoryID);
      if (items.length === 0) {
        log.info("No inventory to track");
        return;
      }
      await tx.insert(inventoryRecordTable).values(
        items.map((item) => ({
          quantity: item.quantity * -1,
          inventoryID: item.inventoryID,
          id: createID("inventoryRecord"),
          notes: "automated",
        })),
      );

      const updated = await tx
        .select({
          id: orderItemTable.id,
        })
        .from(orderTable)
        .innerJoin(orderItemTable, eq(orderItemTable.orderID, orderTable.id))
        .where(
          and(
            isNull(orderItemTable.timeInventoryTracked),
            isNotNull(orderTable.timePrinted),
          ),
        );
      const result = await tx
        .update(orderItemTable)
        .set({
          timeInventoryTracked: sql`CURRENT_TIMESTAMP(3)`,
        })
        .where(
          inArray(
            orderItemTable.id,
            updated.map((row) => row.id),
          ),
        );
      log.info("Tracked inventory", { count: result.rowsAffected });
    }, "repeatable read");
  }
}
