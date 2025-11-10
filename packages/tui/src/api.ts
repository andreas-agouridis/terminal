import Terminal from "@terminaldotshop/sdk";
import { Config, Effect, Redacted, Schema } from "effect";
import { Coffee, CoffeeGroup } from "./types";

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
								id: product.id,
								name: product.name,
								productVariantId: variant.id,
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
								id: product.id,
								name: product.name,
								productVariantId: variant.id,
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
				try: () => client.cart.get().then((cart) => cart.data),
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

			return {
				getAll,
				getCart,
				setItemInCart,
			} as const;
		}),
	},
) {}
