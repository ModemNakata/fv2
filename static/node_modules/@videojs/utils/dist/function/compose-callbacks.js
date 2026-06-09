import { isNil } from "../predicate/predicate.js";
//#region src/function/compose-callbacks.ts
/**
* Composes multiple callbacks into one. All callbacks receive same args, no return value.
* Returns undefined if no callbacks provided.
*
* @example
* ```ts
* const onSetup = composeCallbacks(base.onSetup, extension.onSetup);
* onSetup?.(ctx); // Calls both if defined
* ```
*/
function composeCallbacks(...fns) {
	const defined = fns.filter((fn) => !isNil(fn));
	if (defined.length === 0) return void 0;
	if (defined.length === 1) return defined[0];
	return ((...args) => {
		defined.forEach((fn) => fn(...args));
	});
}
//#endregion
export { composeCallbacks };

//# sourceMappingURL=compose-callbacks.js.map