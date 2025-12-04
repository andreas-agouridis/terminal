import { Resource } from "sst";
import { eq, sql } from "drizzle-orm";
import { fn } from "../util/fn";
import { useTransaction } from "../drizzle/transaction";
import { orderItemTable, orderTable } from "../order/order.sql";
import { productTable, productVariantTable } from "../product/product.sql";
import { ErrorCodes, VisibleError } from "../error";
import { z } from "zod";
import { userTable } from "../user/user.sql";
import { Log } from "../util/log";
import { Order } from "../order/order";
import { Actor } from "../actor";

const TERMINAL_ADDRESS = {
  name: "Terminal Products Inc",
  street1: "403 Watchung Ave",
  city: "Plainfield",
  state: "NJ",
  country: "US",
  zip: "07060",
  phone: "+17724446678",
};

const CUSTOMS_DECLARATION = {
  contents_type: "MERCHANDISE",
  non_delivery_option: "RETURN",
  certify: true,
  certify_signer: "Dax Raad",
  incoterm: "DDU",
  exporter_identification: {
    // eori_number: "",
    tax_id: {
      number: "365099653",
      type: "EIN",
    },
  },
};
const CUSTOMS_DECLARATION_ITEM = {
  description: "Roasted Coffee Beans",
  quantity: 1,
  mass_unit: "oz",
  value_currency: "USD",
  tariff_number: "0901.21.00",
  origin_country: "US",
};

export namespace Shippo {
  const log = Log.create({ namespace: "shippo" });

  const Address = z.object({
    name: z.string(),
    street1: z.string(),
    street2: z.string().optional(),
    city: z.string(),
    province: z.string().optional(),
    country: z
      .string()
      .length(2, "Country must be a 2 character country code (ISO 3166-1)"),
    zip: z.string(),
    phone: z.string().optional(),
  });

  export const createShipmentRate = fn(
    z.object({
      ounces: z.number(),
      address: Address,
      subtotal: z.number().int(),
    }),
    async (input) => {
      const shipping = input.address;
      const country = shipping.country.toUpperCase();
      const international = country !== "US";
      const shipment = await api("POST", "/shipments", {
        address_from: TERMINAL_ADDRESS,
        address_to: {
          name: shipping.name,
          street1: shipping.street1,
          street2: shipping.street2,
          city: shipping.city,
          state: shipping.province,
          country: shipping.country,
          zip: shipping.zip,
          phone: shipping.phone,
        },
        customs_declaration: international
          ? {
              ...CUSTOMS_DECLARATION,
              eel_pfc: country === "CA" ? "NOEEI_30_36" : "NOEEI_30_37_a",
              items: [
                {
                  ...CUSTOMS_DECLARATION_ITEM,
                  net_weight: input.ounces,
                  value_amount: (input.subtotal / 100).toString(),
                },
              ],
            }
          : undefined,
        parcels: [
          {
            length: 12,
            width: 12,
            height: 12,
            distance_unit: "in",
            weight: input.ounces,
            mass_unit: "oz",
          },
        ],
        async: false,
        extra: { bypass_address_validation: true },
        // carrier_accounts: ["6c1d6acf7cc74ec5a1a4e64a5bd19107"],
      });

      log.info("shipment data", { shipment: JSON.stringify(shipment) });
      if (shipment.status !== "SUCCESS" || !shipment.rates?.length) {
        throw new VisibleError(
          "validation",
          ErrorCodes.Validation.INVALID_FORMAT,
          "Failed to get shipping rates.",
        );
      }

      shipment.rates.sort(
        (a: { amount: string }, b: { amount: string }) =>
          Number.parseFloat(a.amount) - Number.parseFloat(b.amount),
      );
      const rate = shipment.rates[0];
      const shippingAmount = Number.parseFloat(rate.amount) * 100;
      log.info("selected rate", { rate });
      return {
        shippoRateID: rate.object_id,
        shippingAmount,
        shippingService: `${rate.provider} ${rate.servicelevel.name}`,
        shippingDeliveryEstimate: rate.duration_terms,
      };
    },
  );

  export const createShipment = fn(z.string(), async (orderID) => {
    const items = await useTransaction((tx) =>
      tx
        .select({
          address: orderTable.shippingAddress,
          name: sql`CONCAT(${productTable.name}, " - ", ${productVariantTable.name})`,
          quantity: orderItemTable.quantity,
          amount: orderItemTable.amount,
          shippoLabelID: orderTable.shippoLabelID,
          email: userTable.email,
          price: productVariantTable.price,
          weight: productVariantTable.weight,
        })
        .from(orderTable)
        .innerJoin(orderItemTable, eq(orderItemTable.orderID, orderTable.id))
        .innerJoin(userTable, eq(userTable.id, orderTable.userID))
        .innerJoin(
          productVariantTable,
          eq(productVariantTable.id, orderItemTable.productVariantID),
        )
        .innerJoin(
          productTable,
          eq(productTable.id, productVariantTable.productID),
        )
        .where(eq(orderTable.id, orderID))
        .execute(),
    );
    if (!items.length) throw new Error("Order not found");
    if (items.some((item) => item.shippoLabelID)) {
      log.info("shipment already created", { orderID });
      return;
    }
    const terminalOrder = items[0]!;
    const rate = await createShipmentRate({
      address: terminalOrder.address,
      ounces: items
        .map((item) => item.quantity * item.weight)
        .reduce((a, b) => a + b, 0),
      subtotal: items.map((item) => item.amount).reduce((a, b) => a + b, 0),
    });
    const shipping = terminalOrder.address;

    const weight = items.reduce(
      (sum, item) => sum + item.quantity * item.weight,
      0,
    );
    const order = await api("POST", "/v1/orders", {
      to_address: {
        name: shipping.name,
        street1: shipping.street1,
        street2: shipping.street2,
        city: shipping.city,
        state: shipping.province,
        country: shipping.country,
        zip: shipping.zip,
        // International orders need a phone, and email helps
        phone: shipping.phone,
        email: terminalOrder.email,
      },
      line_items: items.map((item) => ({
        quantity: item.quantity,
        title: item.name,
        weight: 12,
        weight_unit: "oz",
      })),
      placed_at: new Date().toISOString(),
      weight,
      weight_unit: "oz",
    });
    log.info("order data", { order });
    log.info("rate data", { rate });

    const shipment = await api("POST", "/v1/transactions", {
      rate: rate.shippoRateID,
      metadata: JSON.stringify({
        orderID,
      }),
      order: order.object_id,
    });
    log.info("shipment data", { shipment: JSON.stringify(shipment) });
    if (shipment.object_state !== "VALID") {
      throw new Error("Shipment invalid");
    }
    await Order.update({
      id: orderID,
      shippoOrderID: order.object_id,
      shippoLabelID: shipment.object_id,
      shippoRateID: rate.shippoRateID,
    });

    while (true) {
      const result = await api("GET", "/transactions/" + shipment.object_id);
      log.info("polling", { data: JSON.stringify(result, null, 2) });
      if (result.status === "ERROR") throw new Error("Shipment invalid");
      if (result.status !== "SUCCESS") {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      await Order.update({
        id: orderID,
        labelURL: result.label_url,
        trackingURL: result.tracking_url_provider,
        trackingNumber: result.tracking_number,
      });
      break;
    }
  });

  export const assertValidAddress = fn(
    Address.omit({ country: true }).extend({
      country: z.string(),
    }),
    async (input) => {
      const result = await api("POST", "/v1/addresses", {
        name: input.name,
        street1: input.street1,
        street2: input.street2,
        city: input.city,
        state: input.province,
        country: input.country,
        zip: input.zip,
        validate: true,
      });
      log.info("result data", {
        result: JSON.stringify(result, null, 2),
      });
      if (result.test || result.validation_results?.is_valid) {
        return {
          ...input,
          street1: result.street1,
          street2: result.street2,
          city: result.city,
          province: result.province ?? result.state,
          country: result.country,
          zip: result.zip,
          phone: result.phone || input.phone,
        };
      }
      throw new AddressInvalidError();
    },
  );

  export class AddressInvalidError extends VisibleError {
    constructor() {
      super(
        "validation",
        ErrorCodes.Validation.INVALID_FORMAT,
        "Address is invalid",
      );
    }
  }

  const ROOT = "https://api.goshippo.com";
  async function api(method: string, path: string, body?: any) {
    return fetch(ROOT + path, {
      method,
      headers: {
        authorization: `ShippoToken ${Resource.ShippoSecret.value}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => {
      return r.json();
    }) as any;
  }
}
