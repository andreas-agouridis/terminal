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

import "./components/pretty-header";
import { CoffeeGroups } from "./api";
import type { Section } from "./components/pretty-header";
import type { Coffee, CoffeeGroup } from "./types";

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

const runtimeAtom = Atom.runtime(CoffeeGroups.Default);

// You can then use the AtomRuntime to make Atom's that use the services from the Layer
const coffeeGroupsAtom = runtimeAtom.atom(
	Effect.gen(function* () {
		const coffeeGroups = yield* CoffeeGroups;
		return yield* coffeeGroups.getAll;
	}),
);

const currentCoffeeIdxAtom = Atom.make(0);

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

		return {
			coffeeGroups,
			coffees,
			coffeeIds,
			currentCoffeeIdx,
			currentlySelectedCoffee,
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

function CoffeeSelector(props: {
	coffeeGroups: CoffeeGroup[];
	coffeeIds: string[];
	selectedCoffee: Coffee;
}) {
	const moveSelection = useAtomSet(moveSelectionAtom);
	useKeyboard((key) => {
		if (key.name === "down") {
			moveSelection("next");
		} else if (key.name === "up") {
			moveSelection("previous");
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

type Page = "shop" | "account" | "cart";

const pageAtom = Atom.make<Page>("shop");

function App() {
	const coffeeState = useAtomValue(coffeeStateAtom);
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
			ProductListFailure: ({ cause }) => (
				<text>{`Could not list producsts:: ${cause}`}</text>
			),
		}),
		onSuccess(state) {
			let pageElement;

			switch (page) {
				case "shop":
					pageElement = [
						<CoffeeSelector
							coffeeGroups={state.value.coffeeGroups}
							coffeeIds={state.value.coffeeIds}
							selectedCoffee={state.value.currentlySelectedCoffee}
						/>,
					];
					break;
				case "cart":
					pageElement = [<text>Cart</text>];
					break;
				case "account":
					pageElement = [<text>Account</text>];
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
