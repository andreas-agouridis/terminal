import {
	Result,
	useAtom,
	useAtomSet,
	useAtomValue,
} from "@effect-atom/atom-react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { Token } from "../types";
import {
	tokensAtom,
	selectedTokenIdxAtom,
	createTokenAtom,
	deleteTokenAtom,
	newlyCreatedTokenAtom,
	clearNewTokenAtom,
} from "../../state";

function TokenItem(props: { token: Token; isSelected: boolean }) {
	const createdStr = new Date(props.token.createdAt).toLocaleDateString();

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
			<text
				attributes={props.isSelected ? TextAttributes.BOLD : TextAttributes.DIM}
			>
				{props.token.name}
			</text>
			<text attributes={TextAttributes.DIM}>{`Created: ${createdStr}`}</text>
			{props.token.lastUsedAt && (
				<text attributes={TextAttributes.DIM}>
					{`Last used: ${new Date(props.token.lastUsedAt).toLocaleDateString()}`}
				</text>
			)}
			{props.isSelected && (
				<text attributes={TextAttributes.DIM}>[d] delete</text>
			)}
		</box>
	);
}

function AddTokenButton(props: { isSelected: boolean }) {
	return (
		<box
			width="100%"
			border
			borderColor={props.isSelected ? "green" : "gray"}
			backgroundColor={props.isSelected ? "green" : "transparent"}
			padding={1}
			alignItems="center"
			justifyContent="center"
		>
			<text
				attributes={props.isSelected ? TextAttributes.BOLD : TextAttributes.DIM}
			>
				[+] Create New Token {props.isSelected ? "(press enter)" : ""}
			</text>
		</box>
	);
}

function NewTokenDisplay(props: { token: string; onDismiss: () => void }) {
	useKeyboard((key) => {
		if (key.name === "return" || key.name === "escape") {
			props.onDismiss();
		}
	});

	return (
		<box
			width="100%"
			border
			borderColor="green"
			padding={1}
			alignItems="center"
			justifyContent="center"
		>
			<text attributes={TextAttributes.BOLD}>New Token Created!</text>
			<text></text>
			<text>Copy this token now - it won't be shown again:</text>
			<text></text>
			<text attributes={TextAttributes.BOLD} fg="green">
				{props.token}
			</text>
			<text></text>
			<text attributes={TextAttributes.DIM}>(press enter to dismiss)</text>
		</box>
	);
}

function TokensList(props: {
	tokens: Token[];
	focused: boolean;
	selectedIdx: number;
	setSelectedIdx: (idx: number) => void;
	createToken: () => void;
	deleteToken: (id: string) => void;
}) {
	const {
		tokens,
		focused,
		selectedIdx,
		setSelectedIdx,
		createToken,
		deleteToken,
	} = props;

	// Total items: tokens + 1 for "add" button
	const totalItems = tokens.length + 1;
	const isOnAddButton = selectedIdx === tokens.length;

	useKeyboard((key) => {
		if (!focused) return;

		if (key.name === "down" || key.name === "j") {
			setSelectedIdx(Math.min(selectedIdx + 1, totalItems - 1));
		} else if (key.name === "up" || key.name === "k") {
			setSelectedIdx(Math.max(selectedIdx - 1, 0));
		} else if (key.name === "return") {
			if (isOnAddButton) {
				createToken();
			}
		} else if (key.name === "d") {
			// Delete selected token (not the add button)
			if (!isOnAddButton && tokens[selectedIdx]) {
				deleteToken(tokens[selectedIdx].id);
				// Adjust selection if needed
				if (selectedIdx >= tokens.length - 1 && selectedIdx > 0) {
					setSelectedIdx(selectedIdx - 1);
				}
			}
		}
	});

	return (
		<scrollbox width="100%" height="100%">
			{tokens.length === 0 ? (
				<text attributes={TextAttributes.DIM}>No tokens yet</text>
			) : (
				tokens.map((token, idx) => (
					<TokenItem
						key={token.id}
						token={token}
						isSelected={focused && idx === selectedIdx}
					/>
				))
			)}
			<AddTokenButton isSelected={focused && isOnAddButton} />
		</scrollbox>
	);
}

export function TokensPage(props: { focused: boolean }) {
	const tokensResult = useAtomValue(tokensAtom);
	const [selectedIdx, setSelectedIdx] = useAtom(selectedTokenIdxAtom);
	const createToken = useAtomSet(createTokenAtom);
	const deleteToken = useAtomSet(deleteTokenAtom);
	const newToken = useAtomValue(newlyCreatedTokenAtom);
	const clearNewToken = useAtomSet(clearNewTokenAtom);

	// If showing new token modal, render that instead
	if (newToken) {
		return (
			<NewTokenDisplay token={newToken} onDismiss={() => clearNewToken()} />
		);
	}

	return Result.matchWithError(tokensResult, {
		onInitial: () => <text>Loading tokens...</text>,
		onDefect: (error) => <text>{`Error: ${error}`}</text>,
		onError: () => <text>Failed to load tokens</text>,
		onSuccess: (tokensValue) => (
			<TokensList
				tokens={tokensValue.value}
				focused={props.focused}
				selectedIdx={selectedIdx}
				setSelectedIdx={setSelectedIdx}
				createToken={createToken}
				deleteToken={deleteToken}
			/>
		),
	});
}
