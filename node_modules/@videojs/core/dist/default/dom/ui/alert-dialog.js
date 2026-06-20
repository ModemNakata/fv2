import { createDismissLayer } from "./dismiss-layer.js";
import { listen } from "@videojs/utils/dom";
//#region src/dom/ui/alert-dialog.ts
function createAlertDialog(options) {
	const { onOpenChange } = options;
	let element = null;
	let previousFocus = null;
	let elementAbort = null;
	const layer = createDismissLayer({
		transition: options.transition,
		closeOnEscape: options.closeOnEscape,
		onEscapeDismiss(event) {
			event.stopPropagation();
			applyClose();
		}
	});
	const state = layer.input;
	function applyOpen() {
		previousFocus = document.activeElement;
		const opening = layer.open();
		if (!opening) return;
		onOpenChange(true);
		requestAnimationFrame(() => {
			if (layer.signal.aborted || !state.current.active) return;
			element?.focus();
		});
		opening.then(() => {
			if (layer.signal.aborted || !state.current.active) return;
			options.onOpenChangeComplete?.(true);
		});
	}
	function applyClose() {
		const closing = layer.close(element);
		if (!closing) return;
		onOpenChange(false);
		closing.then(() => {
			if (layer.signal.aborted) return;
			if (previousFocus) {
				previousFocus.focus();
				previousFocus = null;
			}
			options.onOpenChangeComplete?.(false);
		});
	}
	function setupElementListeners() {
		cleanupElementListeners();
		if (!element) return;
		elementAbort = new AbortController();
		const { signal } = elementAbort;
		listen(element, "click", handleElementClick, { signal });
	}
	function cleanupElementListeners() {
		elementAbort?.abort();
		elementAbort = null;
	}
	function handleElementClick(event) {
		if (event.target instanceof HTMLButtonElement) applyClose();
	}
	function setElement(el) {
		element = el;
		setupElementListeners();
	}
	layer.signal.addEventListener("abort", () => {
		cleanupElementListeners();
		element = null;
		previousFocus = null;
	});
	return {
		input: state,
		open: applyOpen,
		close: applyClose,
		setElement,
		destroy: layer.destroy
	};
}
//#endregion
export { createAlertDialog };

//# sourceMappingURL=alert-dialog.js.map