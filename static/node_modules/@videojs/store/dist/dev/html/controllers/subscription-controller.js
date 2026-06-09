import { StoreAccessor } from "../store-accessor.js";
import { noop } from "@videojs/utils/function";
import { isNull } from "@videojs/utils/predicate";
//#region src/html/controllers/subscription-controller.ts
/**
* Resolves a store from context or direct source and manages subscription lifecycle.
*
* Combines store resolution (direct or context) with subscription management.
* Use as a building block for controllers that need store access with subscriptions.
*
* @example
* ```ts
* class MyController<Store extends AnyStore> {
*   #ctrl: SubscriptionController<Store, Tasks>;
*
*   constructor(host: Host, source: StoreSource<Store>) {
*     this.#ctrl = new SubscriptionController(host, source, {
*       subscribe: (store, onChange) => store.queue.subscribe(onChange),
*       getValue: (store) => store.queue.tasks,
*     });
*   }
*
*   get value() {
*     return this.#ctrl.value;
*   }
* }
* ```
*/
var SubscriptionController = class {
	#host;
	#config;
	#accessor;
	#unsubscribe = noop;
	/**
	* @param host - The host element that owns this controller.
	* @param source - Store instance or context to resolve the store from.
	* @param config - Subscription and value extraction configuration.
	*/
	constructor(host, source, config) {
		this.#host = host;
		this.#config = config;
		this.#accessor = new StoreAccessor(host, source, (store) => this.#connect(store));
		host.addController(this);
	}
	get value() {
		const store = this.#accessor.value;
		if (isNull(store)) throw new Error("Store not available");
		return this.#config.getValue(store);
	}
	hostDisconnected() {
		this.#unsubscribe();
		this.#unsubscribe = noop;
	}
	#connect(store) {
		this.#unsubscribe();
		this.#unsubscribe = this.#config.subscribe(store, () => {
			this.#host.requestUpdate();
		});
	}
};
//#endregion
export { SubscriptionController };

//# sourceMappingURL=subscription-controller.js.map