//#region src/function/try-catch.ts
/**
* Wrap a function to catch and handle errors instead of throwing.
*
* @example
* ```ts
* const safeFn = tryCatch(riskyFn, (e) => logger.error(e));
* safeFn?.(); // Never throws
* ```
*/
function tryCatch(fn, onError = console.error) {
	if (!fn) return void 0;
	return ((...args) => {
		try {
			return fn(...args);
		} catch (error) {
			onError(error);
			return;
		}
	});
}
//#endregion
export { tryCatch };

//# sourceMappingURL=try-catch.js.map