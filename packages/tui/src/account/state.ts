import { Atom } from "@effect-atom/atom-react";
import { Effect } from "effect";
import { AccountPage, accountPageList } from "./types";
import type { AccountApi } from "./api";

// Keys for reactivity
export const accountKeys = {
	orders: ["account", "orders"],
	subscriptions: ["account", "subscriptions"],
	tokens: ["account", "tokens"],
	apps: ["account", "apps"],
	addresses: ["account", "addresses"],
	payments: ["account", "payments"],
} as const;

// Current selected account page index
export const currentAccountPageIdxAtom = Atom.make(0);

// Derived atom for the current page
export const currentAccountPageAtom = Atom.make((get) => {
	const idx = get(currentAccountPageIdxAtom);
	return accountPageList[idx] ?? "orders";
});

// Selected index within each sub-page list
export const selectedOrderIdxAtom = Atom.make(0);
export const selectedSubscriptionIdxAtom = Atom.make(0);
export const selectedTokenIdxAtom = Atom.make(0);
export const selectedAppIdxAtom = Atom.make(0);
export const selectedAddressIdxAtom = Atom.make(0);
export const selectedPaymentIdxAtom = Atom.make(0);

// Whether we're focused into a detail view (vs the menu)
export const accountFocusedAtom = Atom.make(false);

// Order detail view state
export const viewingOrderDetailAtom = Atom.make(false);

// Factory to create data atoms with a runtime
export function createAccountDataAtoms(
	runtimeAtom: ReturnType<typeof Atom.runtime>,
	accountApi: AccountApi,
) {
	const ordersAtom = runtimeAtom
		.atom(accountApi.getOrders)
		.pipe(Atom.withReactivity(accountKeys.orders));

	const subscriptionsAtom = runtimeAtom
		.atom(accountApi.getSubscriptions)
		.pipe(Atom.withReactivity(accountKeys.subscriptions));

	const tokensAtom = runtimeAtom
		.atom(accountApi.getTokens)
		.pipe(Atom.withReactivity(accountKeys.tokens));

	const appsAtom = runtimeAtom
		.atom(accountApi.getApps)
		.pipe(Atom.withReactivity(accountKeys.apps));

	const addressesAtom = runtimeAtom
		.atom(accountApi.getAddresses)
		.pipe(Atom.withReactivity(accountKeys.addresses));

	const paymentMethodsAtom = runtimeAtom
		.atom(accountApi.getPaymentMethods)
		.pipe(Atom.withReactivity(accountKeys.payments));

	// Actions
	const createTokenAtom = runtimeAtom.fn(
		(_: void, _ctx) => accountApi.createToken,
		{ reactivityKeys: accountKeys.tokens },
	);

	const deleteTokenAtom = runtimeAtom.fn(
		(id: string, _ctx) => accountApi.deleteToken(id),
		{ reactivityKeys: accountKeys.tokens },
	);

	const createAppAtom = runtimeAtom.fn(
		(params: { name: string; redirectUri: string }, _ctx) =>
			accountApi.createApp(params.name, params.redirectUri),
		{ reactivityKeys: accountKeys.apps },
	);

	const deleteAppAtom = runtimeAtom.fn(
		(id: string, _ctx) => accountApi.deleteApp(id),
		{ reactivityKeys: accountKeys.apps },
	);

	return {
		ordersAtom,
		subscriptionsAtom,
		tokensAtom,
		appsAtom,
		addressesAtom,
		paymentMethodsAtom,
		createTokenAtom,
		deleteTokenAtom,
		createAppAtom,
		deleteAppAtom,
	} as const;
}

export type AccountDataAtoms = ReturnType<typeof createAccountDataAtoms>;
