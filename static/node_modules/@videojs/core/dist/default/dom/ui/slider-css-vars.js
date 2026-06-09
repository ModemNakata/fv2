import { SliderCSSVars } from "../../core/ui/slider/slider-css-vars.js";
//#region src/dom/ui/slider-css-vars.ts
function getSliderCSSVars(state) {
	return {
		[SliderCSSVars.fill]: `${state.fillPercent.toFixed(3)}%`,
		[SliderCSSVars.pointer]: `${state.pointerPercent.toFixed(3)}%`
	};
}
function getTimeSliderCSSVars(state) {
	return {
		...getSliderCSSVars(state),
		[SliderCSSVars.buffer]: `${state.bufferPercent.toFixed(3)}%`
	};
}
/** Compute structural positioning styles for a slider preview element. */
function getSliderPreviewStyle(width, overflow) {
	const halfWidth = width / 2;
	return {
		position: "absolute",
		left: overflow === "visible" ? `calc(var(${SliderCSSVars.pointer}) - ${halfWidth}px)` : `min(max(0px, calc(var(${SliderCSSVars.pointer}) - ${halfWidth}px)), calc(100% - ${width}px))`,
		width: "max-content",
		pointerEvents: "none"
	};
}
//#endregion
export { getSliderCSSVars, getSliderPreviewStyle, getTimeSliderCSSVars };

//# sourceMappingURL=slider-css-vars.js.map