//#region src/core/signals/effect.d.ts
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
declare function effect(fn: () => (() => void) | void): () => void;
//#endregion
export { effect };
//# sourceMappingURL=effect.d.ts.map