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

export class CoffeeGroups extends Effect.Service<CoffeeGroups>()(
	"app/CoffeeGroups",
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

			return { getAll } as const;
		}),
	},
) {}
