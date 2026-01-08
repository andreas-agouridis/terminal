import { TextAttributes } from "@opentui/core";
import type { App } from "../types";

const mockApps: App[] = [];

function AppItem(props: { app: App; isSelected: boolean }) {
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
				{props.app.name}
			</text>
			<text attributes={TextAttributes.DIM}>
				{`Client ID: ${props.app.clientId}`}
			</text>
			<text attributes={TextAttributes.DIM}>
				{`Redirect: ${props.app.redirectUri}`}
			</text>
		</box>
	);
}

function CreateAppButton(props: { isSelected: boolean }) {
	return (
		<box
			width="100%"
			height={3}
			backgroundColor={props.isSelected ? "green" : "transparent"}
			padding={1}
		>
			<text
				attributes={props.isSelected ? TextAttributes.BOLD : TextAttributes.DIM}
			>
				[+] Create New App
			</text>
		</box>
	);
}

export function AppsPage(props: { focused: boolean }) {
	const selectedIdx = 0;

	return (
		<box width="100%">
			<text attributes={TextAttributes.BOLD}>Apps (OAuth 2.0)</text>
			<text></text>
			{mockApps.map((app, idx) => (
				<AppItem
					key={app.id}
					app={app}
					isSelected={props.focused && idx === selectedIdx}
				/>
			))}
			<CreateAppButton
				isSelected={props.focused && selectedIdx === mockApps.length}
			/>
		</box>
	);
}
