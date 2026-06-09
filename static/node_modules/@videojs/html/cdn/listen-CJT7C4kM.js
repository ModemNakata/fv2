//#region ../utils/dist/dom/listen.js
function listen(target, type, listener, options) {
	target.addEventListener(type, listener, options);
	return () => target.removeEventListener(type, listener, options);
}

//#endregion
export { listen as t };
//# sourceMappingURL=listen-CJT7C4kM.js.map