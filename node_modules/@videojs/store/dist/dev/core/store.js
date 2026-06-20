import { AbortControllerRegistry } from "./abort-controller-registry.js";
import { throwDestroyedError, throwNoTargetError } from "./errors.js";
import { createState } from "./state.js";
import { isNull, isObject } from "@videojs/utils/predicate";
//#region src/core/store.ts
const STORE_SYMBOL = Symbol.for("@videojs/store");
function createStore() {
	return (slice, options = {}) => {
		let target = null;
		let destroyed = false;
		const setupAbort = new AbortController();
		const signals = new AbortControllerRegistry();
		let state;
		function validate() {
			if (destroyed) throwDestroyedError();
			if (!target) throwNoTargetError();
		}
		const initialState = slice.state({
			target: () => {
				validate();
				return target;
			},
			signals,
			get: () => state.current,
			set: (partial) => state.patch(partial)
		});
		state = createState(initialState);
		const store = {
			[STORE_SYMBOL]: true,
			get $state() {
				return state;
			},
			get target() {
				return target;
			},
			get destroyed() {
				return destroyed;
			},
			get state() {
				return state.current;
			},
			attach,
			destroy,
			subscribe
		};
		for (const key of Object.keys(initialState)) Object.defineProperty(store, key, {
			get: () => state.current[key],
			enumerable: true
		});
		try {
			options.onSetup?.({
				store,
				signal: setupAbort.signal
			});
		} catch (error) {
			reportError(error);
		}
		return store;
		function attach(newTarget) {
			if (destroyed) throwDestroyedError();
			signals.reset();
			target = newTarget;
			const attachContext = {
				target: newTarget,
				signal: signals.base,
				get: () => state.current,
				set: (partial) => state.patch(partial),
				reportError,
				store: {
					get state() {
						return state.current;
					},
					subscribe
				}
			};
			try {
				slice.attach?.(attachContext);
			} catch (error) {
				reportError(error);
			}
			try {
				options.onAttach?.({
					store,
					target: newTarget,
					signal: signals.base
				});
			} catch (error) {
				reportError(error);
			}
			return detach;
		}
		function detach() {
			if (isNull(target)) return;
			signals.reset();
			target = null;
			state.patch(initialState);
		}
		function destroy() {
			if (destroyed) return;
			destroyed = true;
			detach();
			setupAbort.abort();
		}
		function subscribe(callback, options) {
			return state.subscribe(callback, options);
		}
		function reportError(error) {
			if (options.onError) options.onError({
				store,
				error
			});
			else console.error("[vjs-store]", error);
		}
	};
}
function isStore(value) {
	return isObject(value) && STORE_SYMBOL in value;
}
//#endregion
export { createStore, isStore };

//# sourceMappingURL=store.js.map