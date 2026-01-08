import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { Order } from "../types";
import { ordersAtom, selectedOrderIdxAtom } from "../../state";

function OrderItem(props: {
	order: Order;
	index: number;
	isSelected: boolean;
}) {
	const dateStr = new Date(props.order.createdAt).toLocaleDateString();
	const total = (props.order.amount / 100).toFixed(2);

	return (
		<box
			width="100%"
			border
			borderColor={props.isSelected ? "orange" : "gray"}
			backgroundColor={props.isSelected ? "orange" : "transparent"}
			padding={1}
			alignItems="center"
			justifyContent="center"
		>
			<box flexDirection="row" width="100%" justifyContent="center">
				<text
					attributes={
						props.isSelected ? TextAttributes.BOLD : TextAttributes.DIM
					}
					fg="orange"
				>
					{`order #${props.index}`}
				</text>
				<text
					attributes={
						props.isSelected ? TextAttributes.BOLD : TextAttributes.DIM
					}
				>
					{`  $${total}`}
				</text>
			</box>
			<text attributes={TextAttributes.DIM}>{`date: ${dateStr}`}</text>
		</box>
	);
}

function OrdersList(props: {
	orders: Order[];
	focused: boolean;
	selectedIdx: number;
	setSelectedIdx: (idx: number) => void;
}) {
	const { orders, focused, selectedIdx, setSelectedIdx } = props;

	useKeyboard((key) => {
		if (!focused) return;

		if (key.name === "down" || key.name === "j") {
			setSelectedIdx(Math.min(selectedIdx + 1, orders.length - 1));
		} else if (key.name === "up" || key.name === "k") {
			setSelectedIdx(Math.max(selectedIdx - 1, 0));
		}
	});

	if (orders.length === 0) {
		return (
			<box
				width="100%"
				height="100%"
				alignItems="center"
				justifyContent="center"
			>
				<text attributes={TextAttributes.DIM}>no orders found</text>
			</box>
		);
	}

	return (
		<scrollbox width="100%" height="100%">
			{orders.map((order, idx) => (
				<OrderItem
					key={order.id}
					order={order}
					index={orders.length - idx - 1}
					isSelected={focused && idx === selectedIdx}
				/>
			))}
		</scrollbox>
	);
}

export function OrdersPage(props: { focused: boolean }) {
	const ordersResult = useAtomValue(ordersAtom);
	const [selectedIdx, setSelectedIdx] = useAtom(selectedOrderIdxAtom);

	return Result.matchWithError(ordersResult, {
		onInitial: () => <text>Loading orders...</text>,
		onDefect: (error) => <text>{`Error: ${error}`}</text>,
		onError: () => <text>Failed to load orders</text>,
		onSuccess: (ordersValue) => (
			<OrdersList
				orders={ordersValue.value}
				focused={props.focused}
				selectedIdx={selectedIdx}
				setSelectedIdx={setSelectedIdx}
			/>
		),
	});
}
