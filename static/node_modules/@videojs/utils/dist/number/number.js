//#region src/number/number.ts
/** Clamp a value between min and max (inclusive). */
function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}
/** Snap a value to the nearest step, offset from min. */
function roundToStep(value, step, min) {
	const nearest = Math.round((value - min) / step) * step + min;
	const dot = `${step}`.indexOf(".");
	return dot === -1 ? nearest : Number(nearest.toFixed(`${step}`.length - dot - 1));
}
//#endregion
export { clamp, roundToStep };

//# sourceMappingURL=number.js.map