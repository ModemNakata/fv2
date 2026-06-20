//#region src/dom/animation-frame.ts
/**
* Request an animation frame with cleanup.
*
* @example
* ```ts
* const cancel = animationFrame((time) => console.log('Frame at', time));
* cancel(); // Cancel if needed
* ```
*/
function animationFrame(callback) {
	const id = requestAnimationFrame(callback);
	return () => cancelAnimationFrame(id);
}
//#endregion
export { animationFrame };

//# sourceMappingURL=animation-frame.js.map