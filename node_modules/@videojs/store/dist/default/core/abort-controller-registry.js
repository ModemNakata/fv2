import { anyAbortSignal } from "@videojs/utils/events";
//#region src/core/abort-controller-registry.ts
var AbortControllerRegistry = class {
	#base = new AbortController();
	#keys = /* @__PURE__ */ new Map();
	/** The attach-scoped signal. Aborts on detach or reattach. */
	get base() {
		return this.#base.signal;
	}
	/** Clears all keyed signals, leaving base intact. */
	clear() {
		for (const controller of this.#keys.values()) controller.abort();
		this.#keys.clear();
	}
	/** Resets base and clears all keyed signals. */
	reset() {
		this.clear();
		this.#base.abort();
		this.#base = new AbortController();
	}
	/** Creates a new signal for the key, superseding any previous signal. */
	supersede(key) {
		this.#keys.get(key)?.abort();
		const controller = new AbortController();
		this.#keys.set(key, controller);
		return anyAbortSignal([this.#base.signal, controller.signal]);
	}
};
//#endregion
export { AbortControllerRegistry };

//# sourceMappingURL=abort-controller-registry.js.map