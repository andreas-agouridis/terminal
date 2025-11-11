import { Brand, Schema } from "effect";

export const Pages = Schema.Literal("shop", "account", "cart");
export type Page = typeof Pages.Type;

// Define UserId as a branded number
export type ProductVariantID = string & Brand.Brand<"ProductVariantID">;

// Constructor for UserId
export const ProductVariantID = Brand.nominal<ProductVariantID>();

const ProductVariantIDSchema = Schema.String.pipe(
	Schema.fromBrand(ProductVariantID),
);

export class Coffee extends Schema.Class<Coffee>("Coffee")({
	id: ProductVariantIDSchema,
	name: Schema.String,
	price: Schema.Number,
	details: Schema.String,
	description: Schema.String,
	color: Schema.String,
}) {}

export class CoffeeGroup extends Schema.Class<CoffeeGroup>("CoffeeGroup")({
	name: Schema.String,
	coffees: Schema.Array(Coffee),
}) {}

export class CartItem extends Schema.Class<CartItem>("CartItem")({
	id: ProductVariantIDSchema,
	quantity: Schema.Int,
	subtotal: Schema.Int.pipe(
		Schema.annotations({
			description: "Subtotal of the item's cost, in cents (USD)",
		}),
	),
}) {}

export class Cart extends Schema.Class<Cart>("Cart")({
	items: Schema.Array(CartItem),

	subtotal_amount: Schema.Int,
	shipping_amount: Schema.optional(Schema.Int),
	total_amount: Schema.optional(Schema.Int),
}) {}
