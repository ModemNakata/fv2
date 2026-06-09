//#region src/dom/listen.ts
function listen(target, type, listener, options) {
	target.addEventListener(type, listener, options);
	return () => target.removeEventListener(type, listener, options);
}
//#endregion
export { listen };

//# sourceMappingURL=listen.js.map