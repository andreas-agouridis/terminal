import { Brand, Schema } from "effect";

// Account sub-pages
export const AccountPages = Schema.Literal(
	"orders",
	"subscriptions",
	"tokens",
	"apps",
	"addresses",
	"payments",
	"faq",
	"about",
);
export type AccountPage = typeof AccountPages.Type;

export const accountPageLabels: Record<AccountPage, string> = {
	orders: "Order History",
	subscriptions: "Subscriptions",
	tokens: "Access Tokens",
	apps: "Apps (OAuth 2.0)",
	addresses: "Addresses",
	payments: "Payment Methods",
	faq: "FAQ",
	about: "About",
};

export const accountPageList: AccountPage[] = [
	"orders",
	"subscriptions",
	"tokens",
	"apps",
	"addresses",
	"payments",
	"faq",
	"about",
];

// Order types
export type OrderID = string & Brand.Brand<"OrderID">;
export const OrderID = Brand.nominal<OrderID>();

export class OrderItem extends Schema.Class<OrderItem>("OrderItem")({
	productVariantId: Schema.String,
	quantity: Schema.Int,
	amount: Schema.Int,
	description: Schema.String,
}) {}

export class Order extends Schema.Class<Order>("Order")({
	id: Schema.String.pipe(Schema.fromBrand(OrderID)),
	amount: Schema.Int,
	createdAt: Schema.String,
	items: Schema.Array(OrderItem),
	tracking: Schema.optional(
		Schema.Struct({
			number: Schema.optional(Schema.String),
			url: Schema.optional(Schema.String),
			service: Schema.optional(Schema.String),
		}),
	),
}) {}

// Subscription types
export type SubscriptionID = string & Brand.Brand<"SubscriptionID">;
export const SubscriptionID = Brand.nominal<SubscriptionID>();

export class Subscription extends Schema.Class<Subscription>("Subscription")({
	id: Schema.String.pipe(Schema.fromBrand(SubscriptionID)),
	productVariantId: Schema.String,
	quantity: Schema.Int,
	status: Schema.String,
	frequency: Schema.String,
	nextShipDate: Schema.optional(Schema.String),
}) {}

// Token types
export type TokenID = string & Brand.Brand<"TokenID">;
export const TokenID = Brand.nominal<TokenID>();

export class Token extends Schema.Class<Token>("Token")({
	id: Schema.String.pipe(Schema.fromBrand(TokenID)),
	name: Schema.String,
	createdAt: Schema.String,
	lastUsedAt: Schema.optional(Schema.String),
}) {}

// App types (OAuth 2.0)
export type AppID = string & Brand.Brand<"AppID">;
export const AppID = Brand.nominal<AppID>();

export class App extends Schema.Class<App>("App")({
	id: Schema.String.pipe(Schema.fromBrand(AppID)),
	name: Schema.String,
	redirectUri: Schema.String,
	clientId: Schema.String,
	clientSecret: Schema.optional(Schema.String),
}) {}

// Address types
export type AddressID = string & Brand.Brand<"AddressID">;
export const AddressID = Brand.nominal<AddressID>();

export class Address extends Schema.Class<Address>("Address")({
	id: Schema.String.pipe(Schema.fromBrand(AddressID)),
	name: Schema.String,
	street1: Schema.String,
	street2: Schema.optional(Schema.String),
	city: Schema.String,
	province: Schema.String,
	country: Schema.String,
	zip: Schema.String,
	isDefault: Schema.Boolean,
}) {}

// Payment method types
export type PaymentMethodID = string & Brand.Brand<"PaymentMethodID">;
export const PaymentMethodID = Brand.nominal<PaymentMethodID>();

export class PaymentMethod extends Schema.Class<PaymentMethod>("PaymentMethod")(
	{
		id: Schema.String.pipe(Schema.fromBrand(PaymentMethodID)),
		brand: Schema.String,
		last4: Schema.String,
		expMonth: Schema.Int,
		expYear: Schema.Int,
		isDefault: Schema.Boolean,
	},
) {}
