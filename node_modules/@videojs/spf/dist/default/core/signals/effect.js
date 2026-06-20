import { Signal } from "signal-polyfill";
//#region src/core/signals/effect.ts
const pending = /* @__PURE__ */ new Set();
const watcher = new Signal.subtle.Watcher(() => {
	queueMicrotask(runPending);
});
function runPending() {
	for (const c of watcher.getPending()) pending.add(c);
	watcher.watch();
	for (const c of pending) {
		pending.delete(c);
		c.get();
	}
}
/**
* Run a side effect whenever its signal dependencies change.
*
* Executes immediately (synchronous initial run), then re-runs on the next
* microtask after any dependency changes. If the callback returns a function,
* it is called before each re-run and when the effect is stopped — the same
* cleanup contract as Preact Signals, Maverick Signals, and Svelte 5 $effect.
*
* Returns a cleanup function that stops the effect.
*/
function effect(fn) {
	let cleanup;
	const c = new Signal.Computed(() => {
		if (typeof cleanup === "function") cleanup();
		cleanup = fn();
	});
	watcher.watch(c);
	c.get();
	return () => {
		watcher.unwatch(c);
		if (typeof cleanup === "function") cleanup();
	};
}
//#endregion
export { effect };

//# sourceMappingURL=effect.js.map