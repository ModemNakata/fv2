//#region src/events/abort.ts
/**
* Compose multiple abort signals into one that aborts when **any** input fires.
* Uses native `AbortSignal.any` when available, otherwise falls back to a
* manual `AbortController` composition for Chromium ≤115 and similar runtimes.
*/
function anyAbortSignal(signals) {
	if ("any" in AbortSignal) return AbortSignal.any(signals);
	const controller = new AbortController();
	for (const signal of signals) {
		if (signal.aborted) {
			controller.abort(signal.reason);
			return controller.signal;
		}
		signal.addEventListener("abort", () => controller.abort(signal.reason), { signal: controller.signal });
	}
	return controller.signal;
}
/**
* Race a promise against an abort signal. Rejects immediately if the signal
* is already aborted or becomes aborted before the promise settles.
*/
function abortable(promise, signal) {
	if (signal.aborted) return Promise.reject(signal.reason);
	let onAbort;
	return Promise.race([promise, new Promise((_, reject) => {
		onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
	})]).finally(() => {
		signal.removeEventListener("abort", onAbort);
	});
}
//#endregion
export { abortable, anyAbortSignal };

//# sourceMappingURL=abort.js.map