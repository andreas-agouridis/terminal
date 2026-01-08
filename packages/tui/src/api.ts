import Terminal from "@terminaldotshop/sdk";
import { Config, Effect, Redacted, Schema } from "effect";
import { Cart, CartItem, Coffee, CoffeeGroup, ProductVariantID } from "./types";
import { Token, TokenID, Order, OrderID, OrderItem } from "./account/types";

// TODO: Schema.Defect

export class MissingBearerToken extends Schema.TaggedError<MissingBearerToken>(
	"MissingBearerToken",
)("MissingBearerToken", {}) {}

export class ProductListFailure extends Schema.TaggedError<ProductListFailure>(
	"ProductListFailure",
)("ProductListFailure", {
	cause: Schema.Defect,
}) {}

export class GetCartError extends Schema.TaggedError<GetCartError>(
	"GetCartError",
)("GetCartError", {
	cause: Schema.Defect,
}) {}

export class GetTokensError extends Schema.TaggedError<GetTokensError>(
	"GetTokensError",
)("GetTokensError", {
	cause: Schema.Defect,
}) {}

export class CreateTokenError extends Schema.TaggedError<CreateTokenError>(
	"CreateTokenError",
)("CreateTokenError", {
	cause: Schema.Defect,
}) {}

export class DeleteTokenError extends Schema.TaggedError<DeleteTokenError>(
	"DeleteTokenError",
)("DeleteTokenError", {
	cause: Schema.Defect,
}) {}

export class GetOrdersError extends Schema.TaggedError<GetOrdersError>(
	"GetOrdersError",
)("GetOrdersError", {
	cause: Schema.Defect,
}) {}

export class TerminalService extends Effect.Service<TerminalService>()(
	"app/TerminalService",
	{
		effect: Effect.gen(function* () {
			const bearerToken = yield* Config.redacted("TERMINAL_BEARER_TOKEN").pipe(
				Effect.mapError((_) => new MissingBearerToken()),
			);

			const client = new Terminal({
				environment: "production",
				bearerToken: Redacted.value(bearerToken),
			});

			const products = yield* Effect.tryPromise({
				try: () => client.product.list(),
				catch: (error) => new ProductListFailure({ cause: error }),
			});

			const featured: Coffee[] = [];
			const originals: Coffee[] = [];

			for (const product of products.data) {
				if (product.tags?.featured) {
					for (const variant of product.variants) {
						featured.push(
							Coffee.make({
								id: ProductVariantID(variant.id),
								name: product.name,
								price: variant.price,
								details: variant.name,
								description: product.description,
								color: product.tags?.color ?? "orange",
							}),
						);
					}
				} else {
					for (const variant of product.variants) {
						originals.push(
							Coffee.make({
								id: ProductVariantID(variant.id),
								name: product.name,
								price: variant.price,
								details: variant.name,
								description: product.description,
								color: product.tags?.color ?? "orange",
							}),
						);
					}
				}
			}

			const getAll = Effect.succeed([
				CoffeeGroup.make({
					name: "Featured",
					coffees: featured,
				}),
				CoffeeGroup.make({
					name: "Originals",
					coffees: originals,
				}),
			]);

			const getCart = Effect.tryPromise({
				try: () =>
					client.cart.get().then((cart) => {
						const items = cart.data.items.map((item) =>
							CartItem.make({
								id: ProductVariantID(item.productVariantID),
								quantity: item.quantity,
								subtotal: item.subtotal,
							}),
						);
						return Cart.make({
							items,
							subtotal_amount: cart.data.amount.subtotal,
							shipping_amount: cart.data.amount.shipping,
							total_amount: cart.data.amount.total,
						});
					}),
				catch: (error) => new GetCartError({ cause: error }),
			});

			const setItemInCart = (id: string, quantity: number) =>
				Effect.tryPromise({
					try: () => {
						return client.cart.setItem({
							productVariantID: id,
							quantity: quantity,
						});
					},
					catch: (error) => new GetCartError({ cause: error }),
				});

			const getTokens = Effect.tryPromise({
				try: () =>
					client.token.list().then((res) =>
						res.data.map((token: any) =>
							Token.make({
								id: TokenID(token.id),
								name: token.token ? `****${token.token.slice(-8)}` : "Token",
								createdAt: token.created ?? new Date().toISOString(),
								lastUsedAt: token.time?.last ?? undefined,
							}),
						),
					),
				catch: (error) => new GetTokensError({ cause: error }),
			});

			const createToken = Effect.tryPromise({
				try: () =>
					client.token.create().then((res: any) => ({
						token: Token.make({
							id: TokenID(res.data.id),
							name: res.data.token
								? `****${res.data.token.slice(-8)}`
								: "New Token",
							createdAt: res.data.created ?? new Date().toISOString(),
							lastUsedAt: undefined,
						}),
						// Return the full token value so user can copy it
						fullToken: res.data.token as string,
					})),
				catch: (error) => new CreateTokenError({ cause: error }),
			});

			const deleteToken = (id: string) =>
				Effect.tryPromise({
					try: () => client.token.delete(id),
					catch: (error) => new DeleteTokenError({ cause: error }),
				});

			const getOrders = Effect.tryPromise({
				try: () =>
					client.order.list().then((res) =>
						res.data.map((order: any) =>
							Order.make({
								id: OrderID(order.id),
								amount:
									(order.amount?.subtotal ?? 0) + (order.amount?.shipping ?? 0),
								createdAt: order.created ?? new Date().toISOString(),
								items: (order.items ?? []).map((item: any) =>
									OrderItem.make({
										productVariantId: item.productVariantID ?? "",
										quantity: item.quantity ?? 0,
										amount: item.amount ?? 0,
										description: item.description ?? "",
									}),
								),
								tracking: order.tracking
									? {
											number: order.tracking.number,
											url: order.tracking.url,
											service: order.tracking.service,
										}
									: undefined,
							}),
						),
					),
				catch: (error) => new GetOrdersError({ cause: error }),
			});

			return {
				getAll,
				getCart,
				setItemInCart,
				getTokens,
				createToken,
				deleteToken,
				getOrders,
			} as const;
		}),
	},
) {}
