//#region src/dom/raf-throttle.ts
/** Throttle a function to fire at most once per animation frame. */
function rafThrottle(fn) {
	let rafId = null;
	let latestArgs;
	const throttled = (...args) => {
		latestArgs = args;
		if (rafId !== null) return;
		rafId = requestAnimationFrame(() => {
			rafId = null;
			fn(...latestArgs);
		});
	};
	throttled.cancel = () => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	};
	return throttled;
}
//#endregion
export { rafThrottle };

//# sourceMappingURL=raf-throttle.js.map