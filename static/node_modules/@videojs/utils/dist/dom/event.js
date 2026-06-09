//#region src/dom/event.ts
/** Resolve the deepest event target, preferring composedPath for shadow DOM. */
function resolveEventTarget(event) {
	const path = event.composedPath();
	return path.length > 0 ? path[0] : event.target;
}
function onEvent(target, type, options) {
	return new Promise((resolve, reject) => {
		const handleAbort = () => {
			reject(options?.signal?.reason ?? "Aborted");
		};
		if (options?.signal?.aborted) {
			handleAbort();
			return;
		}
		options?.signal?.addEventListener("abort", handleAbort, { once: true });
		target.addEventListener(type, (event) => {
			options?.signal?.removeEventListener("abort", handleAbort);
			resolve(event);
		}, {
			...options,
			once: true
		});
	});
}
//#endregion
export { onEvent, resolveEventTarget };

//# sourceMappingURL=event.js.map