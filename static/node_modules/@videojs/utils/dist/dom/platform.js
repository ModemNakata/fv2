//#region src/dom/platform.ts
function isMacOS() {
	return typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
}
//#endregion
export { isMacOS };

//# sourceMappingURL=platform.js.map