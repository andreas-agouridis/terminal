import { TextAttributes } from "@opentui/core";

const faqs = [
	{
		question: "How do I place an order?",
		answer:
			"Navigate to the Shop tab, select your coffee, and add it to your cart.",
	},
	{
		question: "How do subscriptions work?",
		answer:
			"Subscriptions automatically ship your favorite coffee on a recurring schedule.",
	},
	{
		question: "What payment methods are accepted?",
		answer:
			"We accept all major credit cards through our secure payment system.",
	},
	{
		question: "How do I track my order?",
		answer:
			"Check your Order History for tracking information once your order ships.",
	},
	{
		question: "Can I cancel my subscription?",
		answer: "Yes, you can cancel anytime from the Subscriptions page.",
	},
];

function FaqItem(props: { question: string; answer: string }) {
	return (
		<box width="100%" marginBottom={1}>
			<text width="100%" wrapMode="word" attributes={TextAttributes.BOLD}>
				Q: {props.question}
			</text>
			<text width="100%" wrapMode="word" attributes={TextAttributes.DIM}>
				A: {props.answer}
			</text>
		</box>
	);
}

export function FaqPage() {
	return (
		<scrollbox width="100%" height="100%">
			<text attributes={TextAttributes.BOLD}>Frequently Asked Questions</text>
			<text></text>
			{faqs.map((faq, idx) => (
				<FaqItem key={idx} question={faq.question} answer={faq.answer} />
			))}
		</scrollbox>
	);
}
