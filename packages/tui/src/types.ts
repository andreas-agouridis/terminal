import { Schema } from "effect";

export class Coffee extends Schema.Class<Coffee>("Coffee")({
	id: Schema.String,
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
