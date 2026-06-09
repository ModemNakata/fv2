import { clamp } from "@videojs/utils/number";
//#region src/dom/utils/pointer.ts
/** Convert a pointer event position to a 0–100 percent along an element's rect. */
function getPercentFromPointerEvent(event, rect, orientation, isRTL) {
	let ratio;
	if (orientation === "vertical") ratio = 1 - (event.clientY - rect.top) / rect.height;
	else if (isRTL) ratio = (rect.right - event.clientX) / rect.width;
	else ratio = (event.clientX - rect.left) / rect.width;
	if (!Number.isFinite(ratio)) return 0;
	return clamp(ratio * 100, 0, 100);
}
//#endregion
export { getPercentFromPointerEvent };

//# sourceMappingURL=pointer.js.map