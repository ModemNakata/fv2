import { getTransitionStyleAttrs } from "../../../core/ui/transition.js";
import { forceLayout } from "../../utils/layout.js";
import { createState } from "@videojs/store";
//#region src/dom/ui/menu/create-menu-view-transition.ts
const DEFAULT_MENU_VIEW_TRANSITION_STATE = {
	phase: "hidden",
	direction: "forward",
	triggerId: null
};
async function waitForElementAnimations(element) {
	const animations = element.getAnimations?.() ?? [];
	if (!animations.length) return;
	await Promise.all(animations.map((animation) => animation.finished)).catch(() => {});
}
function focusFirstMenuViewItem(element) {
	element.querySelector("[data-item]")?.focus({ preventScroll: true });
}
function getMenuViewState(phase) {
	return phase === "entering" || phase === "active" ? "active" : "inactive";
}
function getMenuViewTransitionAttrs(state) {
	return {
		"data-menu-view": "",
		"data-menu-view-state": getMenuViewState(state.phase),
		"data-direction": state.direction,
		...getTransitionStyleAttrs({
			transitionStarting: state.phase === "entering",
			transitionEnding: state.phase === "exiting"
		}),
		"data-open": state.phase !== "hidden" ? "" : void 0,
		hidden: state.phase === "hidden"
	};
}
function createMenuViewTransition(options = {}) {
	const input = createState(DEFAULT_MENU_VIEW_TRANSITION_STATE);
	const waitForAnimations = options.waitForAnimations ?? waitForElementAnimations;
	const focusFirstItem = options.focusFirstItem ?? focusFirstMenuViewItem;
	let element = null;
	let transitionId = 0;
	let raf1 = 0;
	let raf2 = 0;
	let focusRaf = 0;
	let scheduledTransitionId = 0;
	let scheduledPhase = null;
	function cancelFrames() {
		cancelAnimationFrame(raf1);
		cancelAnimationFrame(raf2);
		cancelAnimationFrame(focusRaf);
		raf1 = 0;
		raf2 = 0;
		focusRaf = 0;
		scheduledTransitionId = 0;
		scheduledPhase = null;
	}
	function scheduleCurrentPhase() {
		const { phase } = input.current;
		if (!element || phase !== "entering" && phase !== "exiting") return;
		if (scheduledTransitionId === transitionId && scheduledPhase === phase) return;
		scheduledTransitionId = transitionId;
		scheduledPhase = phase;
		if (phase === "entering") scheduleEnterComplete(transitionId, element);
		else scheduleExitComplete(transitionId, element);
	}
	function scheduleEnterComplete(currentTransitionId, currentElement) {
		forceLayout(currentElement);
		raf1 = requestAnimationFrame(() => {
			if (currentTransitionId !== transitionId) return;
			raf2 = requestAnimationFrame(() => {
				if (currentTransitionId !== transitionId) return;
				forceLayout(currentElement);
				input.patch({ phase: "active" });
				focusRaf = requestAnimationFrame(() => {
					if (currentTransitionId !== transitionId) return;
					focusFirstItem(currentElement);
				});
			});
		});
	}
	function scheduleExitComplete(currentTransitionId, currentElement) {
		forceLayout(currentElement);
		raf1 = requestAnimationFrame(async () => {
			await waitForAnimations(currentElement);
			if (currentTransitionId !== transitionId) return;
			const { direction, triggerId } = input.current;
			input.patch({
				phase: "hidden",
				triggerId: null
			});
			if (direction === "back") options.restoreFocus?.(triggerId);
		});
	}
	function startEnter(direction, triggerId) {
		transitionId++;
		cancelFrames();
		input.patch({
			phase: "entering",
			direction,
			triggerId
		});
		scheduleCurrentPhase();
	}
	function startExit(direction) {
		transitionId++;
		cancelFrames();
		input.patch({
			phase: "exiting",
			direction
		});
		scheduleCurrentPhase();
	}
	function setElement(nextElement) {
		if (element === nextElement) return;
		element = nextElement;
		scheduleCurrentPhase();
	}
	function sync({ active, direction, triggerId = null }) {
		const { phase } = input.current;
		if (active && (phase === "hidden" || phase === "exiting")) startEnter(direction, triggerId);
		else if (!active && (phase === "active" || phase === "entering")) startExit(direction);
	}
	function destroy() {
		transitionId++;
		cancelFrames();
		element = null;
		input.patch(DEFAULT_MENU_VIEW_TRANSITION_STATE);
	}
	return {
		input,
		setElement,
		sync,
		destroy
	};
}
//#endregion
export { createMenuViewTransition, getMenuViewTransitionAttrs };

//# sourceMappingURL=create-menu-view-transition.js.map