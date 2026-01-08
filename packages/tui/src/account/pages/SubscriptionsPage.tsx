import { TextAttributes } from "@opentui/core";
import type { Subscription } from "../types";

const mockSubscriptions: Subscription[] = [];

function SubscriptionItem(props: {
	subscription: Subscription;
	isSelected: boolean;
}) {
	return (
		<box
			width="100%"
			height={4}
			backgroundColor={props.isSelected ? "orange" : "transparent"}
			padding={1}
		>
			<text
				attributes={props.isSelected ? TextAttributes.BOLD : TextAttributes.DIM}
			>
				{`${props.subscription.frequency} - Qty: ${props.subscription.quantity}`}
			</text>
			<text attributes={TextAttributes.DIM}>
				{`Status: ${props.subscription.status}`}
			</text>
		</box>
	);
}

export function SubscriptionsPage(props: { focused: boolean }) {
	if (mockSubscriptions.length === 0) {
		return (
			<box
				width="100%"
				height="100%"
				alignItems="center"
				justifyContent="center"
			>
				<text attributes={TextAttributes.DIM}>No subscriptions</text>
			</box>
		);
	}

	return (
		<box width="100%">
			<text attributes={TextAttributes.BOLD}>Subscriptions</text>
			<text></text>
			{mockSubscriptions.map((sub, idx) => (
				<SubscriptionItem
					key={sub.id}
					subscription={sub}
					isSelected={props.focused && idx === 0}
				/>
			))}
		</box>
	);
}
