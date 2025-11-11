import { Coffee } from "../types";

export function CartItem(props: {
	coffee: Coffee;
	quantity: number;
	selected: boolean;
}) {
	return (
		<box
			width="100%"
			height={3}
			flexDirection="row"
			alignItems="center"
			justifyContent="center"
			border={props.selected}
			borderColor={props.selected ? props.coffee.color : "transparent"}
		>
			<text>{`${props.coffee.name} | Quantity: ${props.quantity}`}</text>
		</box>
	);
}
