//#region src/dom/animation-frame.d.ts
/**
 * Request an animation frame with cleanup.
 *
 * @example
 * ```ts
 * const cancel = animationFrame((time) => console.log('Frame at', time));
 * cancel(); // Cancel if needed
 * ```
 */
declare function animationFrame(callback: FrameRequestCallback): () => void;
//#endregion
export { animationFrame };
//# sourceMappingURL=animation-frame.d.ts.map