import { TextAttributes } from "@opentui/core";
import type { Address } from "../types";

const mockAddresses: Address[] = [];

function AddressItem(props: { address: Address; isSelected: boolean }) {
	return (
		<box
			width="100%"
			height={6}
			backgroundColor={props.isSelected ? "orange" : "transparent"}
			padding={1}
		>
			<text
				attributes={props.isSelected ? TextAttributes.BOLD : TextAttributes.DIM}
			>
				{props.address.name} {props.address.isDefault ? "(Default)" : ""}
			</text>
			<text attributes={TextAttributes.DIM}>{props.address.street1}</text>
			{props.address.street2 && (
				<text attributes={TextAttributes.DIM}>{props.address.street2}</text>
			)}
			<text attributes={TextAttributes.DIM}>
				{`${props.address.city}, ${props.address.province} ${props.address.zip}`}
			</text>
		</box>
	);
}

export function AddressesPage(props: { focused: boolean }) {
	if (mockAddresses.length === 0) {
		return (
			<box
				width="100%"
				height="100%"
				alignItems="center"
				justifyContent="center"
			>
				<text attributes={TextAttributes.DIM}>No saved addresses</text>
			</box>
		);
	}

	return (
		<box width="100%">
			<text attributes={TextAttributes.BOLD}>Addresses</text>
			<text></text>
			{mockAddresses.map((address, idx) => (
				<AddressItem
					key={address.id}
					address={address}
					isSelected={props.focused && idx === 0}
				/>
			))}
		</box>
	);
}
