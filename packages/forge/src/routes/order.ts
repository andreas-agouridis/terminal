import { Action, Layout, Page, ctx, io } from "@forgeapp/sdk";
import { useTransaction } from "@terminal/core/drizzle/transaction";
import { entries, groupBy, map, pipe } from "remeda";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  sum,
} from "@terminal/core/drizzle/index";
import { orderItemTable, orderTable } from "@terminal/core/order/order.sql";
import { Order as OrderM } from "@terminal/core/order/order";
import { PDFDocument } from "pdf-lib";
import { Resource } from "sst";
import { bus } from "sst/aws/bus";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Product } from "@terminal/core/product/index";
import {
  productTable,
  productVariantTable,
} from "@terminal/core/product/product.sql";
import { Shippo } from "@terminal/core/shippo/index";
import * as queries from "../queries";
import * as formatters from "../formatters";

const s3 = new S3Client();

export const Order = new Page({
  name: "Order",
  handler: async () => {
    const needPrinting = await useTransaction((tx) =>
      tx
        .select({ count: count(orderTable.id) })
        .from(orderTable)
        .where(
          and(isNull(orderTable.timePrinted), isNotNull(orderTable.labelURL)),
        )
        .then((rows) => rows[0]!.count),
    );

    const totals = await useTransaction((tx) =>
      tx
        .select({
          product: sql<string>`CONCAT(${productTable.name}, ' - ', ${productVariantTable.name})`,
          total: sql<number>`SUM(${orderItemTable.quantity})`,
        })
        .from(orderItemTable)
        .innerJoin(orderTable, eq(orderItemTable.orderID, orderTable.id))
        .innerJoin(
          productVariantTable,
          eq(orderItemTable.productVariantID, productVariantTable.id),
        )
        .innerJoin(
          productTable,
          eq(productVariantTable.productID, productTable.id),
        )
        .where(
          and(isNull(orderTable.timePrinted), isNotNull(orderTable.labelURL)),
        )
        .groupBy(
          productTable.id,
          productVariantTable.id,
          productTable.name,
          productVariantTable.name,
        ),
    );

    return new Layout({
      title: "Order",
      menuItems:
        needPrinting > 0
          ? [
              {
                label: `Print ${needPrinting} orders`,
                route: "order/print",
              },
            ]
          : [],
      children: [
        io.display.table("Unprinted Items", {
          isFilterable: false,
          data: totals,
        }),
        io.display.table("Orders", {
          getData: async (input) => {
            const queryTerm = input.queryTerm?.trim();
            return queries.getAllOrders(
              {
                offset: input.offset,
                pageSize: input.pageSize,
              },
              queryTerm,
            );
          },
          rowMenuItems: (row) =>
            [
              row.label && {
                label: "Label",
                url: row.label!,
              },
              row.tracking && {
                label: "Tracking",
                url: row.tracking!,
              },
            ].filter(Boolean) as any,
          columns: [
            "id",
            {
              label: "amount",
              renderCell: (row) => ({
                label: formatters.formatCurrency(row.amount),
              }),
            },
            {
              label: "name",
              renderCell: (row) => ({
                label: row.address?.name || "N/A",
              }),
            },
			{
			  label: "email",
			  renderCell: (row) => ({
				label: row.email || "N/A",
			  }),
			},
            "created",
            "status",
            "fulfiller",
            "updated",
            "printed",
          ],
          isSortable: false,
        }),
      ],
    });
  },
  routes: {
    print: new Action({
      name: "Print Orders",
      unlisted: true,
      async handler() {
        await ctx.loading.start({
          label: "Generating labels",
          description: "This may take a few minutes",
        });

        const orders = await useTransaction((tx) =>
          tx
            .select({
              id: orderTable.id,
              label: orderTable.labelURL,
              count: sum(orderItemTable.quantity),
            })
            .from(orderTable)
            .innerJoin(
              orderItemTable,
              eq(orderItemTable.orderID, orderTable.id),
            )
            .where(
              and(
                isNull(orderTable.timePrinted),
                isNotNull(orderTable.labelURL),
                or(
                  eq(orderTable.fulfiller, "qc"),
                  isNull(orderTable.fulfiller),
                ),
              ),
            )
            .groupBy(orderTable.id)
            .orderBy(sum(orderItemTable.id)),
        );
        const grouped = pipe(
          orders,
          groupBy((x) => x.count || "0"),
          entries(),
          map(async ([count, group]) => {
            const mergedPdf = await PDFDocument.create();
            for (const order of group) {
              console.log(order.id, "label", order.label);
              if (!order.label) continue;
              const response = await fetch(order.label!);
              console.log(order.id, "fetched", response.status);
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              const arrayBuffer = await response.arrayBuffer();
              const pdf = await PDFDocument.load(arrayBuffer);
              const copiedPages = await mergedPdf.copyPages(
                pdf,
                pdf.getPageIndices(),
              );
              copiedPages.forEach((page) => mergedPdf.addPage(page));
              console.log(order.id, "merged");
            }
            console.log("done merging");
            const bytes = await mergedPdf.save();
            console.log("saved pdf");
            const key = `labels/${new Date().toISOString()}-${count}.pdf`;
            console.log(
              "sending to s3",
              key,
              "length",
              bytes.length,
              "to",
              Resource.IntervalBucket.name,
            );
            await s3
              .send(
                new PutObjectCommand({
                  Bucket: Resource.IntervalBucket.name,
                  Key: key,
                  Body: bytes,
                  ContentType: "application/pdf",
                }),
              )
              .catch((ex) => {
                console.error(ex);
                throw ex;
              });
            console.log("done sending", key);
            const command = new GetObjectCommand({
              Bucket: Resource.IntervalBucket.name,
              Key: key,
            });
            const presigned = await getSignedUrl(s3, command, {
              expiresIn: 3600,
            });
            console.log(presigned);
            return {
              count,
              label: presigned,
            };
          }),
        );
        const labels = await Promise.all(grouped);
        console.log("labels", labels);
        await io.display.metadata("Order", {
          layout: "list",
          data: [
            {
              label: "Orders",
              value: orders.length,
            },
            ...labels.map((item: any) => ({
              label: `${item.count} count`,
              value: item.label,
            })),
          ],
        });
        const result = await io.confirm("Confirm these orders as printed?");
        if (result) {
          useTransaction((tx) =>
            tx
              .update(orderTable)
              .set({
                timePrinted: sql`CURRENT_TIMESTAMP(3)`,
              })
              .where(
                inArray(
                  orderTable.id,
                  orders.map((x) => x.id),
                ),
              ),
          );
        }
        await ctx.redirect({
          route: "order",
        });
      },
    }),

    create: new Action({
      name: "Create",
      handler: async () => {
        const products = await Product.list();
        const results = await io.group(
          products.flatMap((product) => {
            return product.variants.map((variant) =>
              io.input.number(`${product.name} - ${variant.name}`, {
                defaultValue: 0,
              }),
            );
          }),
        );
        const items = {} as Record<string, number>;
        let total = 0;
        for (const [number, product] of products.entries()) {
          const amount = results[number] as number;
          if (amount === 0) continue;
          total += amount;
          items[product.variants[0]!.id] = amount;
        }
        if (total === 0) return;
        console.log(items);
        const [
          email,
          name,
          street1,
          street2,
          city,
          province,
          zip,
          country,
          phone,
        ] = await io.group([
          io.input.text("Email"),
          io.input.text("Name"),
          io.input.text("Street 1"),
          io.input.text("Street 2").optional(),
          io.input.text("City"),
          io.input.text("State / Province"),
          io.input.text("Zip"),
          io.input.text("Country"),
          io.input.text("Phone").optional(),
        ]);
        await OrderM.createInternal({
          email,
          items,
          address: {
            name,
            street1,
            street2,
            city,
            province,
            zip,
            country,
            phone,
          },
        });
        await ctx.redirect({
          route: "order",
        });
      },
    }),
    shipping: new Action({
      name: "Shipping",
      async handler() {
        const [
          email,
          name,
          street1,
          street2,
          city,
          province,
          zip,
          country,
          phone,
          weight,
        ] = await io.group([
          io.input.text("Email"),
          io.input.text("Name"),
          io.input.text("Street 1"),
          io.input.text("Street 2").optional(),
          io.input.text("City"),
          io.input.text("State / Province"),
          io.input.text("Zip"),
          io.input.text("Country"),
          io.input.text("Phone").optional(),
          io.input.number("Weight (oz)"),
        ]);

        const shipping = await Shippo.createShipmentRate({
          subtotal: 0,
          address: {
            name,
            street1,
            street2,
            city,
            province,
            zip,
            country,
            phone,
          },
          ounces: weight,
        });

        await io.display.object("shipping", { data: shipping });
      },
    }),
  },
});
