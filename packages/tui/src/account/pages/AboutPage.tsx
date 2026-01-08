import { TextAttributes } from "@opentui/core";

export function AboutPage() {
	return (
		<box width="100%">
			<text attributes={TextAttributes.BOLD}>About Terminal Shop</text>
			<text></text>
			<text>Terminal Shop is coffee for your terminal.</text>
			<text></text>
			<text attributes={TextAttributes.DIM}>
				We believe great coffee and great code go together.
			</text>
			<text attributes={TextAttributes.DIM}>
				Built by developers, for developers.
			</text>
			<text></text>
			<text>Visit us at: https://terminal.shop</text>
			<text></text>
			<text attributes={TextAttributes.DIM}>Version 1.0.0</text>
		</box>
	);
}
