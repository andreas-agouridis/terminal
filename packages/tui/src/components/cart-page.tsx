import { Atom, useAtom, useAtomSet } from "@effect-atom/atom-react";
import { Cart, Coffee, ProductVariantID } from "../types";
import { CartItem } from "./cart-item";
import { useKeyboard } from "@opentui/react";
import { setItemInCartAtom } from "../state";

const selectedCartItemAtom = Atom.make(0);

export function CartPage(props: {
	cart: Cart;
	coffees: Map<ProductVariantID, Coffee>;
}) {
	const [selectedItem, setSelectedItem] = useAtom(selectedCartItemAtom);
	const setItemInCart = useAtomSet(setItemInCartAtom);

	if (selectedItem >= props.cart.items.length || selectedItem < 0) {
		setSelectedItem(0);
	}

	useKeyboard((key) => {
		if (key.name === "down") {
			setSelectedItem((selectedItem + 1) % props.cart.items.length);
		} else if (key.name === "up") {
			setSelectedItem(
				(selectedItem + props.cart.items.length - 1) % props.cart.items.length,
			);
		}

		const selectedCoffee = props.cart.items[selectedItem];
		if (selectedCoffee) {
			if (key.name === "right") {
				setItemInCart({
					id: selectedCoffee.id,
					delta: 1,
				});
			} else if (key.name === "left") {
				setItemInCart({
					id: selectedCoffee.id,
					delta: -1,
				});
			}
		}
	});

	return (
		<box>
			<text>Cart</text>
			{props.cart.items.map((item, i) => (
				<CartItem
					key={item.id}
					coffee={props.coffees.get(item.id)!}
					selected={i === selectedItem}
					quantity={item.quantity}
				/>
			))}
		</box>
	);
}
