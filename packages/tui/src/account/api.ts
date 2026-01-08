import { Effect, Schema } from "effect";
import {
	Order,
	OrderID,
	OrderItem,
	Subscription,
	SubscriptionID,
	Token,
	TokenID,
	App,
	AppID,
	Address,
	AddressID,
	PaymentMethod,
	PaymentMethodID,
} from "./types";

// Error types
export class GetOrdersError extends Schema.TaggedError<GetOrdersError>(
	"GetOrdersError",
)("GetOrdersError", {
	cause: Schema.Defect,
}) {}

export class GetSubscriptionsError extends Schema.TaggedError<GetSubscriptionsError>(
	"GetSubscriptionsError",
)("GetSubscriptionsError", {
	cause: Schema.Defect,
}) {}

export class GetTokensError extends Schema.TaggedError<GetTokensError>(
	"GetTokensError",
)("GetTokensError", {
	cause: Schema.Defect,
}) {}

export class GetAppsError extends Schema.TaggedError<GetAppsError>(
	"GetAppsError",
)("GetAppsError", {
	cause: Schema.Defect,
}) {}

export class GetAddressesError extends Schema.TaggedError<GetAddressesError>(
	"GetAddressesError",
)("GetAddressesError", {
	cause: Schema.Defect,
}) {}

export class GetPaymentMethodsError extends Schema.TaggedError<GetPaymentMethodsError>(
	"GetPaymentMethodsError",
)("GetPaymentMethodsError", {
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

export class CreateAppError extends Schema.TaggedError<CreateAppError>(
	"CreateAppError",
)("CreateAppError", {
	cause: Schema.Defect,
}) {}

export class DeleteAppError extends Schema.TaggedError<DeleteAppError>(
	"DeleteAppError",
)("DeleteAppError", {
	cause: Schema.Defect,
}) {}

// Factory function to create account API methods from a Terminal client
export function createAccountApi(client: {
	order: { list: () => Promise<{ data: unknown[] }> };
	subscription: { list: () => Promise<{ data: unknown[] }> };
	token: {
		list: () => Promise<{ data: unknown[] }>;
		create: () => Promise<{ data: unknown }>;
		delete: (id: string) => Promise<void>;
	};
	app: {
		list: () => Promise<{ data: unknown[] }>;
		create: (params: {
			name: string;
			redirectUri: string;
		}) => Promise<{ data: unknown }>;
		delete: (id: string) => Promise<void>;
	};
	address: { list: () => Promise<{ data: unknown[] }> };
	card: { list: () => Promise<{ data: unknown[] }> };
}) {
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

	const getSubscriptions = Effect.tryPromise({
		try: () =>
			client.subscription.list().then((res) =>
				res.data.map((sub: any) =>
					Subscription.make({
						id: SubscriptionID(sub.id),
						productVariantId: sub.productVariantID ?? "",
						quantity: sub.quantity ?? 0,
						status: sub.status ?? "unknown",
						frequency: sub.schedule?.type ?? "unknown",
						nextShipDate: sub.next ?? undefined,
					}),
				),
			),
		catch: (error) => new GetSubscriptionsError({ cause: error }),
	});

	const getTokens = Effect.tryPromise({
		try: () =>
			client.token.list().then((res) =>
				res.data.map((token: any) =>
					Token.make({
						id: TokenID(token.id),
						name: token.name ?? "Unnamed Token",
						createdAt: token.created ?? new Date().toISOString(),
						lastUsedAt: token.time?.last ?? undefined,
					}),
				),
			),
		catch: (error) => new GetTokensError({ cause: error }),
	});

	const createToken = Effect.tryPromise({
		try: () =>
			client.token.create().then((res: any) =>
				Token.make({
					id: TokenID(res.data.id),
					name: res.data.name ?? "Unnamed Token",
					createdAt: res.data.created ?? new Date().toISOString(),
					lastUsedAt: undefined,
				}),
			),
		catch: (error) => new CreateTokenError({ cause: error }),
	});

	const deleteToken = (id: string) =>
		Effect.tryPromise({
			try: () => client.token.delete(id),
			catch: (error) => new DeleteTokenError({ cause: error }),
		});

	const getApps = Effect.tryPromise({
		try: () =>
			client.app.list().then((res) =>
				res.data.map((app: any) =>
					App.make({
						id: AppID(app.id),
						name: app.name ?? "Unnamed App",
						redirectUri: app.redirectURI ?? "",
						clientId: app.id,
						clientSecret: app.secret,
					}),
				),
			),
		catch: (error) => new GetAppsError({ cause: error }),
	});

	const createApp = (name: string, redirectUri: string) =>
		Effect.tryPromise({
			try: () =>
				client.app.create({ name, redirectUri }).then((res: any) =>
					App.make({
						id: AppID(res.data.id),
						name: res.data.name ?? name,
						redirectUri: res.data.redirectURI ?? redirectUri,
						clientId: res.data.id,
						clientSecret: res.data.secret,
					}),
				),
			catch: (error) => new CreateAppError({ cause: error }),
		});

	const deleteApp = (id: string) =>
		Effect.tryPromise({
			try: () => client.app.delete(id),
			catch: (error) => new DeleteAppError({ cause: error }),
		});

	const getAddresses = Effect.tryPromise({
		try: () =>
			client.address.list().then((res) =>
				res.data.map((addr: any) =>
					Address.make({
						id: AddressID(addr.id),
						name: addr.name ?? "",
						street1: addr.street1 ?? "",
						street2: addr.street2 ?? undefined,
						city: addr.city ?? "",
						province: addr.province ?? "",
						country: addr.country ?? "",
						zip: addr.zip ?? "",
						isDefault: addr.selected ?? false,
					}),
				),
			),
		catch: (error) => new GetAddressesError({ cause: error }),
	});

	const getPaymentMethods = Effect.tryPromise({
		try: () =>
			client.card.list().then((res) =>
				res.data.map((card: any) =>
					PaymentMethod.make({
						id: PaymentMethodID(card.id),
						brand: card.brand ?? "Unknown",
						last4: card.last4 ?? "****",
						expMonth: card.expiration?.month ?? 0,
						expYear: card.expiration?.year ?? 0,
						isDefault: card.selected ?? false,
					}),
				),
			),
		catch: (error) => new GetPaymentMethodsError({ cause: error }),
	});

	return {
		getOrders,
		getSubscriptions,
		getTokens,
		createToken,
		deleteToken,
		getApps,
		createApp,
		deleteApp,
		getAddresses,
		getPaymentMethods,
	} as const;
}

export type AccountApi = ReturnType<typeof createAccountApi>;
