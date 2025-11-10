import {
	Atom,
	Result,
	useAtom,
	useAtomSet,
	useAtomValue,
} from "@effect-atom/atom-react";
import { TextAttributes } from "@opentui/core";
import { render, useKeyboard } from "@opentui/react";
import { Effect, Match, Option } from "effect";

import { Terminal } from "@terminaldotshop/sdk";

import "./components/pretty-header";
import { TerminalService } from "./api";
import type { Section } from "./components/pretty-header";
import type { Coffee, CoffeeGroup } from "./types";

const keys = {
	cart: ["cart"],
	example: ["cart", "example"],
} as const;

function DisplayCoffeeGroup(props: {
	group: CoffeeGroup;
	selected: string | undefined;
}) {
	return (
		<box width="90%" margin={1}>
			<text attributes={TextAttributes.BOLD}>~ {props.group.name} ~</text>
			<text></text>
			{props.group.coffees.map((coffee) => {
				const isSelected = props.selected === coffee.id;
				return (
					<box
						key={coffee.id}
						width="100%"
						// border
						// borderColor={props.selected == coffee.id ? "white" : "black"}
						backgroundColor={isSelected ? coffee.color : "transparent"}
					>
						<text
							attributes={isSelected ? TextAttributes.NONE : TextAttributes.DIM}
						>
							{`  ${coffee.name}`}
						</text>
					</box>
				);
			})}
			<text></text>
		</box>
	);
}

const runtimeAtom = Atom.runtime(TerminalService.Default);

// You can then use the AtomRuntime to make Atom's that use the services from the Layer
const coffeeGroupsAtom = runtimeAtom.atom(
	Effect.gen(function* () {
		const coffeeGroups = yield* TerminalService;
		return yield* coffeeGroups.getAll;
	}),
);

const currentCoffeeIdxAtom = Atom.make(0);

const cartAtom = runtimeAtom
	.atom(
		Effect.gen(function* () {
			const coffeeGroups = yield* TerminalService;
			return yield* coffeeGroups.getCart;
		}),
	)
	.pipe(Atom.withReactivity(keys.cart));

const coffeeStateAtom = Atom.make((get) =>
	Effect.gen(function* () {
		const coffeeGroups = yield* get.result(coffeeGroupsAtom);
		const currentCoffeeIdx = get(currentCoffeeIdxAtom);

		const coffees = coffeeGroups.reduce((acc, group) => {
			for (const coffee of group.coffees) {
				acc.set(coffee.id, coffee);
			}

			return acc;
		}, new Map<string, Coffee>());

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

const moveSelectionAtom = Atom.fn((direction: "next" | "previous", ctx) =>
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

const setItemInCartAtom = runtimeAtom.fn(
	(args: { productVariantId: string; delta: number }, ctx) =>
		Effect.gen(function* () {
			const terminal = yield* TerminalService;
			const state = yield* ctx.result(coffeeStateAtom);

			const cart = state.cart;
			const item = cart.items.find(
				(item) => item.productVariantID === args.productVariantId,
			);
			const quantity = item?.quantity ?? 0;
			return yield* terminal.setItemInCart(
				args.productVariantId,
				Math.max(0, quantity + args.delta),
			);
		}),
	{ reactivityKeys: keys.cart },
);

function CoffeeSelector(props: {
	coffeeGroups: CoffeeGroup[];
	coffeeIds: string[];
	selectedCoffee: Coffee;
	cart: Terminal.Cart;
}) {
	const moveSelection = useAtomSet(moveSelectionAtom);
	const setItemInCart = useAtomSet(setItemInCartAtom);

	useKeyboard((key) => {
		if (key.name === "down") {
			moveSelection("next");
		} else if (key.name === "up") {
			moveSelection("previous");
		} else if (key.name === "right") {
			setItemInCart({
				productVariantId: props.selectedCoffee.productVariantId,
				delta: 1,
			});
		} else if (key.name === "left") {
			setItemInCart({
				productVariantId: props.selectedCoffee.productVariantId,
				delta: -1,
			});
		}
	});

	return (
		<box flexDirection="row" width="100%">
			<box width="25%">
				{props.coffeeGroups.map((group) => (
					<box key={group.name} gap={1} width="100%">
						<DisplayCoffeeGroup
							group={group}
							selected={props.selectedCoffee.id}
						/>
					</box>
				))}
			</box>
			<box
				alignItems="flex-start"
				justifyContent="flex-start"
				width="75%"
				height="100%"
				minHeight="100%"
				padding={1}
				border
				borderColor="white"
			>
				<box
					width="100%"
					alignItems="center"
					justifyContent="center"
					flexDirection="row"
				>
					<text attributes={TextAttributes.BOLD}>
						{props.selectedCoffee.name}
					</text>
				</box>
				<box
					justifyContent="center"
					alignItems="center"
					width="100%"
					flexDirection="row"
				>
					<text attributes={TextAttributes.DIM}>
						{`${props.selectedCoffee.details} |`}
					</text>
					<text fg={props.selectedCoffee.color}>
						{` ($${props.selectedCoffee.price / 100})`}
					</text>
				</box>
				<text></text>
				<text></text>
				<text width="100%" wrapMode="word">
					{props.selectedCoffee.description}
				</text>
			</box>
		</box>
	);
}

function Header(props: { selected: Page; sections: Section<Page>[] }) {
	return (
		<prettyHeader
			width="100%"
			height={3}
			flexDirection="row"
			selected={props.selected}
			sections={props.sections}
		/>
	);
}

const refreshCartAtom = runtimeAtom.fn(() => Effect.succeed(void 0), {
	reactivityKeys: keys.cart,
});

type Page = "shop" | "account" | "cart";

const pageAtom = Atom.make<Page>("shop");

function App() {
	const coffeeState = useAtomValue(coffeeStateAtom);
	const refreshCart = useAtomSet(refreshCartAtom);
	const [page, setPage] = useAtom(pageAtom);

	const sections: Section<Page>[] = [
		{
			label: "Terminal",
			nav: Option.none(),
			attributes: TextAttributes.BOLD,
		},
		{ label: "Shop", nav: Option.some({ page: "shop", key: "s" }) },
		{ label: "Account", nav: Option.some({ page: "account", key: "a" }) },
		{ label: "Cart", nav: Option.some({ page: "cart", key: "c" }) },
	];

	useKeyboard((key) => {
		if (key.name === "c") {
			refreshCart();
		}

		for (const section of sections) {
			if (Option.isSome(section.nav)) {
				const nav = section.nav.value;
				if (key.name === nav.key) {
					setPage(nav.page);
				}
			}
		}
	});

	return Result.matchWithError(coffeeState, {
		onInitial: () => (
			<box
				border={true}
				borderColor="orange"
				width="100%"
				height="100%"
				justifyContent="center"
				alignItems="center"
			>
				<text>Loading...</text>
			</box>
		),
		onDefect: (error) => <text>{`Error: ${error}`}</text>,
		onError: Match.valueTags({
			MissingBearerToken: () => <text>Please set TERMINAL_BEARER_TOKEN</text>,
			GetCartError: ({ cause }) => (
				<text>{`Could not get cart:: ${cause}`}</text>
			),
			ProductListFailure: ({ cause }) => (
				<text>{`Could not list producsts:: ${cause}`}</text>
			),
		}),
		onSuccess(state) {
			let pageElement: React.ReactNode;

			switch (page) {
				case "shop":
					pageElement = (
						<CoffeeSelector
							coffeeGroups={state.value.coffeeGroups}
							coffeeIds={state.value.coffeeIds}
							selectedCoffee={state.value.currentlySelectedCoffee}
							cart={state.value.cart}
						/>
					);
					break;
				case "cart":
					pageElement = (
						<box>
							<text>Cart</text>
							<text>{`Total: ${state.value.cart.amount.total}`}</text>
						</box>
					);
					break;
				case "account":
					pageElement = <text>Account</text>;
					break;
			}

			return (
				<box justifyContent="center" alignItems="center">
					<box width="100%" height="100%" maxWidth={100} maxHeight={20}>
						<Header sections={sections} selected={page} />
						{pageElement}
					</box>
				</box>
			);
		},
	});
}

render(<App />);
