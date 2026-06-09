//#region src/function/throttle.ts
/**
* Throttle: limits `fn` to at most once per `ms` window.
*
* - Default (no options): trailing-edge only — the first call schedules a
*   timer; subsequent calls within the window update the arguments. The
*   function fires once per window with the latest arguments.
* - `{ leading: true }`: leading + trailing — the first call invokes
*   immediately and opens a cooldown window. Subsequent calls within the
*   window are coalesced to a single trailing-edge invocation.
*/
function throttle(fn, ms, options) {
	const leading = options?.leading ?? false;
	let timerId = null;
	let latestArgs;
	let hasPending = false;
	function startCooldown() {
		timerId = setTimeout(() => {
			timerId = null;
			if (hasPending) {
				hasPending = false;
				fn(...latestArgs);
				startCooldown();
			}
		}, ms);
	}
	const throttled = (...args) => {
		latestArgs = args;
		if (leading) if (timerId === null) {
			fn(...latestArgs);
			startCooldown();
		} else hasPending = true;
		else {
			if (timerId !== null) return;
			timerId = setTimeout(() => {
				timerId = null;
				fn(...latestArgs);
			}, ms);
		}
	};
	throttled.cancel = () => {
		if (timerId !== null) {
			clearTimeout(timerId);
			timerId = null;
		}
		hasPending = false;
	};
	return throttled;
}
//#endregion
export { throttle };

//# sourceMappingURL=throttle.js.map