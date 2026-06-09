//#region src/dom/gesture/tap.ts
const DOUBLETAP_WINDOW = 200;
/**
* Recognizes tap vs doubletap from quick pointer-up events.
*
* Stateful recognizer — tracks tap count and doubletap timing.
* The coordinator handles pointer-down timing (tap threshold) and
* calls `handleUp()` only for quick taps that passed the threshold check.
*/
var TapRecognizer = class {
	#lastTapTime = 0;
	#tapTimer = null;
	handleUp(matches, event) {
		if (matches.resolve("doubletap").length > 0) {
			const now = Date.now();
			if (now - this.#lastTapTime < DOUBLETAP_WINDOW) {
				this.#clearTimer();
				this.#lastTapTime = 0;
				matches.resolve("doubletap")[0]?.onActivate(event);
				return;
			}
			this.#lastTapTime = now;
			this.#clearTimer();
			this.#tapTimer = setTimeout(() => {
				this.#tapTimer = null;
				this.#lastTapTime = 0;
				matches.resolve("tap")[0]?.onActivate(event);
			}, DOUBLETAP_WINDOW);
			return;
		}
		matches.resolve("tap")[0]?.onActivate(event);
	}
	#clearTimer() {
		if (this.#tapTimer !== null) {
			clearTimeout(this.#tapTimer);
			this.#tapTimer = null;
		}
	}
	reset() {
		this.#clearTimer();
		this.#lastTapTime = 0;
	}
};
//#endregion
export { TapRecognizer };

//# sourceMappingURL=tap.js.map