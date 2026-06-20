import { getGestureCoordinator } from "./coordinator.js";
import { TapRecognizer } from "./tap.js";
//#region src/dom/gesture/create-tap-gesture.ts
const recognizers = /* @__PURE__ */ new WeakMap();
function getRecognizer(target) {
	let recognizer = recognizers.get(target);
	if (recognizer) return recognizer;
	recognizer = new TapRecognizer();
	recognizers.set(target, recognizer);
	return recognizer;
}
/**
* Register a tap gesture on a target element.
*
* @example
* ```ts
* const cleanup = createTapGesture(container, (event) => {
*   store.paused ? store.play() : store.pause();
* }, { pointer: 'mouse' });
* ```
*/
function createTapGesture(target, onActivate, options) {
	return getGestureCoordinator(target).add({
		type: "tap",
		recognizer: getRecognizer(target),
		onActivate,
		pointer: options?.pointer,
		region: options?.region,
		disabled: options?.disabled,
		action: options?.action,
		value: options?.value
	});
}
/**
* Register a doubletap gesture on a target element.
*
* @example
* ```ts
* const cleanup = createDoubleTapGesture(container, (event) => {
*   store.fullscreen ? store.exitFullscreen() : store.requestFullscreen();
* }, { region: 'center' });
* ```
*/
function createDoubleTapGesture(target, onActivate, options) {
	return getGestureCoordinator(target).add({
		type: "doubletap",
		recognizer: getRecognizer(target),
		onActivate,
		pointer: options?.pointer,
		region: options?.region,
		disabled: options?.disabled,
		action: options?.action,
		value: options?.value
	});
}
//#endregion
export { createDoubleTapGesture, createTapGesture };

//# sourceMappingURL=create-tap-gesture.js.map