import { clamp } from "@videojs/utils/number";
//#region src/dom/ui/wheel-step.ts
function createWheelStep(options) {
	return { onWheel(event) {
		if (options.isDisabled()) return;
		const direction = Math.sign(event.deltaY);
		if (direction === 0) return;
		event.preventDefault();
		const stepPercent = options.getStepPercent();
		const newPercent = clamp(options.getPercent() - direction * stepPercent, 0, 100);
		options.onValueChange?.(newPercent);
	} };
}
//#endregion
export { createWheelStep };

//# sourceMappingURL=wheel-step.js.map