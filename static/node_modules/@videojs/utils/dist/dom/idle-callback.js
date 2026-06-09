import { supportsIdleCallback } from "./supports.js";
//#region src/dom/idle-callback.ts
/**
* Request an idle callback with cleanup. Falls back to setTimeout for Safari.
*
* @example
* ```ts
* const cancel = idleCallback(doWork, { timeout: 1000 });
* cancel(); // Cancel if needed
* ```
*/
function idleCallback(callback, options) {
	if (supportsIdleCallback()) {
		const id = requestIdleCallback(callback, options);
		return () => cancelIdleCallback(id);
	}
	const id = setTimeout(() => {
		callback({
			didTimeout: false,
			timeRemaining: () => 50
		});
	}, 1);
	return () => clearTimeout(id);
}
//#endregion
export { idleCallback };

//# sourceMappingURL=idle-callback.js.map