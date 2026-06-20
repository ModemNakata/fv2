import { Signal } from "signal-polyfill";
//#region src/core/signals/primitives.ts
/** Read a signal value without tracking it as a dependency. */
const untrack = Signal.subtle.untrack;
/**
* Read a signal's current value without tracking it as a dependency. Sugar
* for `untrack(() => signal.get())` to reduce boilerplate at single-read
* sites. Structurally typed to accept any signal-like (Signal, Computed,
* ReadonlySignal).
*
* Accepts an optional `transform` to project the value in the same call;
* the default is the identity function so the single-arg form returns `T`
* unchanged.
*
* @example
* const value = peek(someSignal);
* const id = peek(presentationSignal, (p) => p?.id);
*/
function peek(source, transform = (v) => v) {
	return untrack(() => transform(source.get()));
}
/** Create a writable reactive value. */
function signal(initialValue, options) {
	return new Signal.State(initialValue, options);
}
/** Create a computed reactive value. */
function computed(fn, options) {
	return new Signal.Computed(fn, options);
}
function update(signal, updater) {
	const current = untrack(() => signal.get());
	if (typeof updater === "function") signal.set(updater(current));
	else signal.set({
		...current,
		...updater
	});
}
/**
* Read every signal in a map and return a plain object snapshot. Each read
* tracks in the surrounding Computed/Effect — equivalent to calling `.get()`
* on a single `Signal<S>` over the merged shape.
*
* Convenience for behaviors that pass whole state/context snapshots to pure
* helpers; prefer per-field reads when only a few fields are needed.
*/
function snapshot(map) {
	const out = {};
	for (const key in map) out[key] = map[key].get();
	return out;
}
//#endregion
export { computed, peek, signal, snapshot, untrack, update };

//# sourceMappingURL=primitives.js.map