import { useAtom, useAtomValue } from "@effect-atom/atom-react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";

import {
	accountPageList,
	accountPageLabels,
	type AccountPage as AccountPageType,
} from "./types";
import {
	currentAccountPageIdxAtom,
	currentAccountPageAtom,
	accountFocusedAtom,
} from "./state";

// Sub-page imports
import { OrdersPage } from "./pages/OrdersPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { TokensPage } from "./pages/TokensPage";
import { AppsPage } from "./pages/AppsPage";
import { AddressesPage } from "./pages/AddressesPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { FaqPage } from "./pages/FaqPage";
import { AboutPage } from "./pages/AboutPage";

function AccountMenuItem(props: {
	page: AccountPageType;
	isSelected: boolean;
}) {
	const label = accountPageLabels[props.page];

	return (
		<box
			width="100%"
			height={1}
			backgroundColor={props.isSelected ? "orange" : "transparent"}
		>
			<text
				attributes={props.isSelected ? TextAttributes.BOLD : TextAttributes.DIM}
			>
				{`  ${label}`}
			</text>
		</box>
	);
}

function AccountMenu(props: { selectedIdx: number }) {
	return (
		<box width="100%" padding={1}>
			{accountPageList.map((page, idx) => (
				<AccountMenuItem
					key={page}
					page={page}
					isSelected={idx === props.selectedIdx}
				/>
			))}
		</box>
	);
}

function AccountDetail(props: { page: AccountPageType; focused: boolean }) {
	switch (props.page) {
		case "orders":
			return <OrdersPage focused={props.focused} />;
		case "subscriptions":
			return <SubscriptionsPage focused={props.focused} />;
		case "tokens":
			return <TokensPage focused={props.focused} />;
		case "apps":
			return <AppsPage focused={props.focused} />;
		case "addresses":
			return <AddressesPage focused={props.focused} />;
		case "payments":
			return <PaymentsPage focused={props.focused} />;
		case "faq":
			return <FaqPage />;
		case "about":
			return <AboutPage />;
		default:
			return <text>Unknown page</text>;
	}
}

export function AccountPage() {
	const [selectedIdx, setSelectedIdx] = useAtom(currentAccountPageIdxAtom);
	const currentPage = useAtomValue(currentAccountPageAtom);
	const [focused, setFocused] = useAtom(accountFocusedAtom);

	const canFocus =
		currentPage === "orders" ||
		currentPage === "subscriptions" ||
		currentPage === "tokens" ||
		currentPage === "apps";

	useKeyboard((key) => {
		if (focused) {
			// When focused into a detail, only handle escape to go back
			if (key.name === "escape" || key.name === "h" || key.name === "left") {
				setFocused(false);
			}
			return;
		}

		// Menu navigation
		if (key.name === "down" || key.name === "j") {
			setSelectedIdx(Math.min(selectedIdx + 1, accountPageList.length - 1));
		} else if (key.name === "up" || key.name === "k") {
			setSelectedIdx(Math.max(selectedIdx - 1, 0));
		} else if (
			key.name === "return" ||
			key.name === "l" ||
			key.name === "right"
		) {
			if (canFocus) {
				setFocused(true);
			}
		}
	});

	return (
		<box flexDirection="row" width="100%" height="100%">
			<box width="25%" border borderColor={focused ? "gray" : "orange"}>
				<AccountMenu selectedIdx={selectedIdx} />
			</box>
			<box width="75%" padding={1}>
				<AccountDetail page={currentPage} focused={focused} />
			</box>
		</box>
	);
}
