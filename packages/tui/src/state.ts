import { Atom } from "@effect-atom/atom-react";
import { TerminalService } from "./api";
import { Effect } from "effect";
import { Coffee, ProductVariantID } from "./types";

export const keys = {
	cart: ["cart"],
	example: ["cart", "example"],
} as const;

export const runtimeAtom = Atom.runtime(TerminalService.Default);

// You can then use the AtomRuntime to make Atom's that use the services from the Layer
export const coffeeGroupsAtom = runtimeAtom.atom(
	Effect.gen(function* () {
		const coffeeGroups = yield* TerminalService;
		return yield* coffeeGroups.getAll;
	}),
);

export const cartAtom = runtimeAtom
	.atom(
		Effect.gen(function* () {
			const coffeeGroups = yield* TerminalService;
			return yield* coffeeGroups.getCart;
		}),
	)
	.pipe(Atom.withReactivity(keys.cart));

export const currentCoffeeIdxAtom = Atom.make(0);

export const coffeeStateAtom = Atom.make((get) =>
	Effect.gen(function* () {
		const coffeeGroups = yield* get.result(coffeeGroupsAtom);
		const currentCoffeeIdx = get(currentCoffeeIdxAtom);

		const coffees = coffeeGroups.reduce((acc, group) => {
			for (const coffee of group.coffees) {
				acc.set(ProductVariantID(coffee.id), coffee);
			}

			return acc;
		}, new Map<ProductVariantID, Coffee>());

		const coffeeIds = coffeeGroups.flatMap((group) =>
			group.coffees.map((coffee) => coffee.id),
		);

		const currentlySelectedCoffee = coffees.get(
			coffeeIds[currentCoffeeIdx % coffeeIds.length]!,
		)!;

		const cart = yield* get.result(cartAtom);

		return {
			coffeeGroups,
			coffees,
			coffeeIds,
			currentCoffeeIdx,
			currentlySelectedCoffee,
			cart,
		};
	}),
);

export const moveSelectionAtom = Atom.fn(
	(direction: "next" | "previous", ctx) =>
		Effect.gen(function* () {
			const state = yield* ctx.result(coffeeStateAtom);
			if (state.coffeeIds.length === 0) {
				return;
			}

			const delta = direction === "next" ? 1 : -1;
			const nextIndex =
				(state.currentCoffeeIdx + delta + state.coffeeIds.length) %
				state.coffeeIds.length;

			ctx.set(currentCoffeeIdxAtom, nextIndex);
		}),
);

export const setItemInCartAtom = runtimeAtom.fn(
	(args: { id: string; delta: number }, ctx) =>
		Effect.gen(function* () {
			const terminal = yield* TerminalService;
			const state = yield* ctx.result(coffeeStateAtom);

			const cart = state.cart;
			const item = cart.items.find((item) => item.id === args.id);
			const quantity = item?.quantity ?? 0;
			return yield* terminal.setItemInCart(
				args.id,
				Math.max(0, quantity + args.delta),
			);
		}),
	{ reactivityKeys: keys.cart },
);

export const refreshCartAtom = runtimeAtom.fn(() => Effect.succeed(void 0), {
	reactivityKeys: keys.cart,
});
