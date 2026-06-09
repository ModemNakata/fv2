import { signal, untrack, update } from "./signals/primitives.js";
//#region src/core/machine.ts
/**
* Provisions the shared mechanics for all machine-like primitives: a snapshot
* signal, an untracked state reader, and a transition function.
*
* Internal — consumed by `createMachineActor` and `createMachineReactor`. Not part of the
* public API.
*/
function createMachineCore(initialSnapshot) {
	const snapshotSignal = signal(initialSnapshot);
	const getState = () => untrack(() => snapshotSignal.get().value);
	const transition = (to) => update(snapshotSignal, (current) => ({
		...current,
		value: to
	}));
	return {
		snapshotSignal,
		getState,
		transition
	};
}
//#endregion
export { createMachineCore };

//# sourceMappingURL=machine.js.map