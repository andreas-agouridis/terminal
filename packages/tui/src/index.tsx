import {
	Atom,
	Result,
	useAtom,
	useAtomSet,
	useAtomValue,
} from "@effect-atom/atom-react";
import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { Effect, Match, Option } from "effect";

import "./components/pretty-header";
import { AccountPage } from "./account";
import { TerminalService } from "./api";
import { CartPage } from "./components/cart-page";
import type { Section } from "./components/pretty-header";
import {
	coffeeStateAtom,
	moveSelectionAtom,
	refreshCartAtom,
	setItemInCartAtom,
} from "./state";
import { Cart, Coffee, CoffeeGroup, Page, ProductVariantID } from "./types";

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

function CoffeeSelector(props: {
	coffeeGroups: CoffeeGroup[];
	coffeeIds: string[];
	selectedCoffee: Coffee;
	cart: Cart;
}) {
	const moveSelection = useAtomSet(moveSelectionAtom);
	const setItemInCart = useAtomSet(setItemInCartAtom);

	const cartItemForSelected = props.cart.items.find(
		(item) => item.id === props.selectedCoffee.id,
	);
	const currentQuantity = cartItemForSelected?.quantity ?? 0;

	useKeyboard((key) => {
		if (key.name === "down") {
			moveSelection("next");
		} else if (key.name === "up") {
			moveSelection("previous");
		} else if (key.name === "right") {
			setItemInCart({
				id: props.selectedCoffee.id,
				delta: 1,
			});
		} else if (key.name === "left") {
			setItemInCart({
				id: props.selectedCoffee.id,
				delta: -1,
			});
		}
	});

	return (
		<box flexDirection="row" width="100%" height="100%" minHeight="100%">
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
			<box width="75%" height="100%" minHeight="100%">
				<box
					alignItems="flex-start"
					justifyContent="flex-start"
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
						height="100%"
						flexDirection="row"
					>
						<text attributes={TextAttributes.DIM}>
							{`${props.selectedCoffee.details} |`}
						</text>
						<text fg={props.selectedCoffee.color}>
							{` ($${props.selectedCoffee.price / 100})`}
						</text>
					</box>
					<text width="100%" wrapMode="word">
						{props.selectedCoffee.description}
					</text>
				</box>
				<box height={3} alignItems="center" justifyContent="center">
					<text>{`< ${currentQuantity} >`}</text>
				</box>
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
				<text>{`Could not list products:: ${cause}`}</text>
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
						<CartPage cart={state.value.cart} coffees={state.value.coffees} />
					);
					break;
				case "account":
					pageElement = <AccountPage />;
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

// render(<App />);
const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
