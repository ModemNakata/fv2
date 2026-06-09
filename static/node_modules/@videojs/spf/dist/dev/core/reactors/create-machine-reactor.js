import { untrack } from "../signals/primitives.js";
import { effect } from "../signals/effect.js";
import { createMachineCore } from "../machine.js";
//#region src/core/reactors/create-machine-reactor.ts
const toArray = (x) => x === void 0 ? [] : Array.isArray(x) ? x : [x];
/**
* Creates a reactive Reactor from a declarative definition.
*
* A Reactor is driven by subscriptions to external signals rather than
* imperative messages. Each state holds an array of effect functions —
* every element becomes one independent `effect()` call gated on that state,
* with its own dependency tracking and cleanup lifecycle.
*
* `'destroying'` and `'destroyed'` are always implicit terminal states.
* `destroy()` transitions through both in sequence: `'destroying'` first (for
* potential async teardown in a future extension), then immediately `'destroyed'`
* for the synchronous base case. Active effect cleanups fire via disposal.
*
* @example
* const reactor = createMachineReactor({
*   initial: 'waiting',
*   monitor: () => srcSignal.get() ? 'active' : 'waiting',
*   states: {
*     active: {
*       // entry: runs once on state entry; fn body is automatically untracked.
*       entry: () => listen(el, 'play', handler),
*       // effects: re-runs whenever tracked signals change.
*       effects: () => { currentTimeSignal.get(); return cleanup; },
*     },
*     waiting: {},
*   }
* });
*/
function createMachineReactor(def) {
	const { snapshotSignal, getState, transition } = createMachineCore({ value: def.initial });
	const effectDisposals = [];
	const wrapResult = (result) => {
		if (!result) return void 0;
		if (typeof result === "function") return result;
		return () => result.abort();
	};
	const untracked = (baseCall) => () => untrack(baseCall);
	const isTerminal = (snapshot) => snapshot.value === "destroying" || snapshot.value === "destroyed";
	const descriptors = [...toArray(def.monitor).map((fn) => ({
		fn: () => {
			const target = fn();
			if (target !== getState()) transition(target);
		},
		shouldSkip: isTerminal
	})), ...Object.entries(def.states).flatMap(([state, stateDef]) => {
		const isNotState = (snapshot) => snapshot.value !== state;
		return [...toArray(stateDef.entry).map((fn) => ({
			fn,
			shouldSkip: isNotState,
			toFnCall: untracked
		})), ...toArray(stateDef.effects).map((fn) => ({
			fn,
			shouldSkip: isNotState
		}))];
	})];
	const toEffect = ({ fn, shouldSkip, toFnCall = (baseCall) => baseCall }) => effect(() => {
		if (shouldSkip(snapshotSignal.get())) return;
		const baseCall = () => fn();
		return wrapResult(toFnCall(baseCall)());
	});
	effectDisposals.push(...descriptors.map(toEffect));
	return {
		get snapshot() {
			return snapshotSignal;
		},
		destroy() {
			const state = getState();
			if (state === "destroying" || state === "destroyed") return;
			transition("destroying");
			transition("destroyed");
			for (const dispose of effectDisposals) dispose();
		}
	};
}
//#endregion
export { createMachineReactor };

//# sourceMappingURL=create-machine-reactor.js.map