import { SnapshotController } from "./snapshot-controller.js";
import { StoreAccessor } from "../store-accessor.js";
import { isNull, isUndefined } from "@videojs/utils/predicate";
//#region src/html/controllers/store-controller.ts
/**
* Access store state and actions.
*
* Without selector: Returns the store, does NOT subscribe to changes.
* With selector: Returns selected state, triggers update when selected state changes (shallowEqual).
*
* @example
* ```ts
* // Store access (no subscription) - access actions
* class Controls extends LitElement {
*   #store = new StoreController(this, storeSource);
*
*   handleClick() {
*     this.#store.value.setVolume(0.5);
*   }
* }
*
* // Selector-based subscription - re-renders when playback changes
* class PlayButton extends LitElement {
*   #playback = new StoreController(this, storeSource, selectPlayback);
*
*   render() {
*     const playback = this.#playback.value;
*     if (!playback) return nothing;
*     return html`<button @click=${playback.toggle}>
*       ${playback.paused ? 'Play' : 'Pause'}
*     </button>`;
*   }
* }
* ```
*/
var StoreController = class {
	#host;
	#selector;
	#accessor;
	#snapshot = null;
	constructor(host, source, selector) {
		this.#host = host;
		this.#selector = selector;
		this.#accessor = new StoreAccessor(host, source, (store) => this.#connect(store));
		host.addController(this);
	}
	get value() {
		const store = this.#accessor.value;
		if (isNull(store)) throw new Error("Store not available");
		if (isUndefined(this.#selector)) return store;
		return this.#snapshot.value;
	}
	hostConnected() {}
	#connect(store) {
		if (isUndefined(this.#selector)) return;
		if (!this.#snapshot) this.#snapshot = new SnapshotController(this.#host, store.$state, this.#selector);
		else this.#snapshot.track(store.$state);
	}
};
//#endregion
export { StoreController };

//# sourceMappingURL=store-controller.js.map