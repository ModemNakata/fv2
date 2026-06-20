import { isStore } from "../core/store.js";
import { noop } from "@videojs/utils/function";
import { ContextConsumer } from "@videojs/element/context";
//#region src/html/store-accessor.ts
/**
* Resolves a store from either a direct instance or context.
*
* When given a direct store, provides immediate access.
* When given a context, sets up a ContextConsumer to receive the store.
*
* @example Direct store
* ```ts
* const accessor = new StoreAccessor(host, store, (s) => console.log('available', s));
* accessor.value; // Store (immediately available)
* ```
*
* @example Context source
* ```ts
* const accessor = new StoreAccessor(host, context, (s) => console.log('available', s));
* accessor.value; // null until context provides store
* ```
*/
var StoreAccessor = class {
	#onAvailable;
	#consumer;
	#directStore;
	constructor(host, source, onAvailable) {
		this.#onAvailable = onAvailable ?? noop;
		if (isStore(source)) {
			this.#directStore = source;
			this.#consumer = null;
		} else {
			this.#directStore = null;
			this.#consumer = new ContextConsumer(host, {
				context: source,
				callback: (store) => this.#onAvailable(store),
				subscribe: false
			});
		}
		host.addController(this);
	}
	/** Returns the store, or null if not yet available from context. */
	get value() {
		if (this.#consumer) return this.#consumer.value ?? null;
		return this.#directStore;
	}
	hostConnected() {
		if (this.#directStore) this.#onAvailable(this.#directStore);
	}
};
//#endregion
export { StoreAccessor };

//# sourceMappingURL=store-accessor.js.map