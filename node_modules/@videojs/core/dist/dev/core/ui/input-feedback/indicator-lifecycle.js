import { getTransitionFlags } from "../transition.js";
//#region src/core/ui/input-feedback/indicator-lifecycle.ts
const INDICATOR_CLOSE_DELAY = 800;
var IndicatorCloseController = class {
	#timer = null;
	#close;
	#getDelay;
	constructor(close, getDelay) {
		this.#close = close;
		this.#getDelay = getDelay;
	}
	arm() {
		this.clear();
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.#close();
		}, this.#getDelay());
	}
	clear() {
		if (this.#timer === null) return;
		clearTimeout(this.#timer);
		this.#timer = null;
	}
	close() {
		this.clear();
		this.#close();
	}
	destroy() {
		this.clear();
	}
};
var IndicatorVisibilityCoordinator = class {
	#handles = /* @__PURE__ */ new Set();
	register(handle) {
		this.#handles.add(handle);
		return () => this.#handles.delete(handle);
	}
	show(handle) {
		for (const nextHandle of this.#handles) if (nextHandle !== handle) nextHandle.close();
	}
};
function getIndicatorCloseDelay(props) {
	return props.closeDelay ?? 800;
}
function isIndicatorPresent(current, transition) {
	return current.open || transition.active;
}
function getRenderedIndicatorState(current, snapshot, transition) {
	const payload = current.open ? current : snapshot;
	return {
		...payload,
		open: current.open && transition.active,
		generation: current.open ? current.generation : payload.generation,
		...getTransitionFlags(transition.status)
	};
}
//#endregion
export { INDICATOR_CLOSE_DELAY, IndicatorCloseController, IndicatorVisibilityCoordinator, getIndicatorCloseDelay, getRenderedIndicatorState, isIndicatorPresent };

//# sourceMappingURL=indicator-lifecycle.js.map