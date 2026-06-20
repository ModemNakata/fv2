//#region src/dom/supports.ts
function supportsIdleCallback() {
	return typeof requestIdleCallback === "function";
}
function supportsAnimationFrame() {
	return typeof requestAnimationFrame === "function";
}
function supportsAnchorPositioning() {
	return typeof CSS !== "undefined" && CSS.supports("anchor-name: --a");
}
//#endregion
export { supportsAnchorPositioning, supportsAnimationFrame, supportsIdleCallback };

//# sourceMappingURL=supports.js.map