//#region src/dom/direction.ts
/** Check whether an element's text direction is right-to-left. */
function isRTL(element) {
	const dir = element.closest("[dir]")?.getAttribute("dir");
	if (dir) return dir.toLowerCase() === "rtl";
	return getComputedStyle(element).direction === "rtl";
}
//#endregion
export { isRTL };

//# sourceMappingURL=direction.js.map