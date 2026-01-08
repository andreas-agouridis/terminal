import { TextAttributes } from "@opentui/core";
import type { PaymentMethod } from "../types";

const mockPaymentMethods: PaymentMethod[] = [];

function PaymentMethodItem(props: {
	payment: PaymentMethod;
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
				{`${props.payment.brand} ****${props.payment.last4}`}{" "}
				{props.payment.isDefault ? "(Default)" : ""}
			</text>
			<text attributes={TextAttributes.DIM}>
				{`Expires: ${props.payment.expMonth}/${props.payment.expYear}`}
			</text>
		</box>
	);
}

export function PaymentsPage(props: { focused: boolean }) {
	if (mockPaymentMethods.length === 0) {
		return (
			<box
				width="100%"
				height="100%"
				alignItems="center"
				justifyContent="center"
			>
				<text attributes={TextAttributes.DIM}>No saved payment methods</text>
			</box>
		);
	}

	return (
		<box width="100%">
			<text attributes={TextAttributes.BOLD}>Payment Methods</text>
			<text></text>
			{mockPaymentMethods.map((payment, idx) => (
				<PaymentMethodItem
					key={payment.id}
					payment={payment}
					isSelected={props.focused && idx === 0}
				/>
			))}
		</box>
	);
}
