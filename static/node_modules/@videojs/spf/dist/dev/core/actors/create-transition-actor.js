import { untrack, update } from "../signals/primitives.js";
import { createMachineCore } from "../machine.js";
//#region src/core/actors/create-transition-actor.ts
/**
* Creates a reducer-shaped actor from an initial context and a reducer function.
*
* The reducer receives the current context and a message and returns the next
* context. Returning the same reference (by identity) skips the signal update —
* so early-returning `context` unchanged is both the no-op and the optimization.
*
* Side effects (e.g. DOM mutations) may be performed inside the reducer.
* They run synchronously before the signal is updated.
*
* @example
* const actor = createTransitionActor(
*   { count: 0 },
*   (context, message: { type: 'increment' }) => ({ count: context.count + 1 })
* );
*/
function createTransitionActor(initialContext, reducer) {
	const { snapshotSignal, getState, transition } = createMachineCore({
		value: "active",
		context: initialContext
	});
	const getContext = () => untrack(() => snapshotSignal.get().context);
	const setContext = (context) => update(snapshotSignal, { context });
	return {
		get snapshot() {
			return snapshotSignal;
		},
		send(message) {
			if (getState() === "destroyed") return;
			const context = getContext();
			const newContext = reducer(context, message);
			if (newContext !== context) setContext(newContext);
		},
		destroy() {
			if (getState() === "destroyed") return;
			transition("destroyed");
		}
	};
}
//#endregion
export { createTransitionActor };

//# sourceMappingURL=create-transition-actor.js.map