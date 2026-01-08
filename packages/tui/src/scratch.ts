import { Effect, Layer, Schema } from "effect";
import { TerminalService } from "./api";

// const showingAdam = Effect.gen(function* () {
// 	return yield* Effect.succeed("Adam");
// });
//

class MyWeirdError extends Schema.TaggedError<MyWeirdError>("MyWeirdError")(
	"MyWeirdError",
	{
		weird: Schema.String,
	},
) {}

class MyWeirdError2 extends Schema.TaggedError<MyWeirdError2>("MyWeirdError2")(
	"MyWeirdError2",
	{
		message: Schema.String,
	},
) {}

const succeedingthings = Effect.succeed("Adam");
const failingthings = Effect.fail(new MyWeirdError2({ message: "Adam 2" }));
const otherFailingThings = Effect.fail(new MyWeirdError({ weird: "Adam" }));

const exampleFunction = Effect.fn(function* () {
	const terminal = yield* TerminalService;
	const result = yield* succeedingthings;
	console.log(result);

	yield* failingthings;
	yield* otherFailingThings;

	return "Adam";
});

const anotherThing = exampleFunction().pipe(
	Effect.catchTags({
		MyWeirdError: (error) => Effect.succeed(error.weird),
	}),
	Effect.provide(TerminalService.Default),
);
