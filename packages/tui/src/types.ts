import { Schema } from "effect";

export class Coffee extends Schema.Class<Coffee>("Coffee")({
	id: Schema.String,
	name: Schema.String,
	productVariantId: Schema.String,
	price: Schema.Number,
	details: Schema.String,
	description: Schema.String,
	color: Schema.String,
}) {}

export class CoffeeGroup extends Schema.Class<CoffeeGroup>("CoffeeGroup")({
	name: Schema.String,
	coffees: Schema.Array(Coffee),
}) {}

export class Cart extends Schema.Class<Cart>("Cart")({
	amount: Schema.Int,
}) {}
