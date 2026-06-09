import { untrack, update } from "../signals/primitives.js";
import { createMachineCore } from "../machine.js";
//#region src/core/actors/create-machine-actor.ts
/**
* Creates a message-driven actor from a declarative definition.
*
* The actor owns a reactive snapshot signal (state + context), an optional
* runner, and dispatches incoming messages to per-state handlers. `'destroyed'`
* is always the implicit terminal state — `destroy()` transitions there
* unconditionally and all subsequent `send()` calls are no-ops.
*
* When a state declares `onSettled`, the framework calls `runner.whenSettled()`
* after the handler returns. The runner owns the generation-token logic — if
* new tasks are scheduled before the current batch settles, the callback is
* automatically superseded.
*
* @example
* const actor = createMachineActor({
*   runner: () => new SerialRunner(),
*   initial: 'idle',
*   context: {},
*   states: {
*     idle: {
*       on: {
*         load: (msg, { transition, runner }) => {
*           segments.forEach(s => runner.schedule(new Task(...)));
*           transition('loading');
*         }
*       }
*     },
*     loading: {
*       onSettled: 'idle',
*       on: {
*         load: (msg, { runner }) => {
*           runner.abortAll();
*           segments.forEach(s => runner.schedule(new Task(...)));
*         }
*       }
*     }
*   }
* });
*/
function createMachineActor(def) {
	const runner = def.runner?.();
	const { snapshotSignal, getState, transition } = createMachineCore({
		value: def.initial,
		context: def.context
	});
	const getContext = () => untrack(() => snapshotSignal.get().context);
	const setContext = (context) => {
		update(snapshotSignal, { context });
	};
	return {
		get snapshot() {
			return snapshotSignal;
		},
		send(message) {
			const state = getState();
			if (state === "destroyed") return;
			const handler = def.states[state]?.on?.[message.type];
			if (!handler) return;
			handler(message, {
				context: getContext(),
				getContext,
				transition: (to) => transition(to),
				setContext,
				...runner ? { runner } : {}
			});
			const newState = getState();
			if (newState !== "destroyed") {
				const newStateDef = def.states[newState];
				if (newStateDef?.onSettled && runner) {
					const targetState = newStateDef.onSettled;
					runner.whenSettled(() => {
						if (getState() !== newState) return;
						transition(targetState);
					});
				}
			}
		},
		destroy() {
			if (getState() === "destroyed") return;
			runner?.destroy();
			transition("destroyed");
		}
	};
}
//#endregion
export { createMachineActor };

//# sourceMappingURL=create-machine-actor.js.map