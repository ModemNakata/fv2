//#region src/dom/idle-callback.d.ts
/**
 * Request an idle callback with cleanup. Falls back to setTimeout for Safari.
 *
 * @example
 * ```ts
 * const cancel = idleCallback(doWork, { timeout: 1000 });
 * cancel(); // Cancel if needed
 * ```
 */
declare function idleCallback(callback: IdleRequestCallback, options?: IdleRequestOptions): () => void;
//#endregion
export { idleCallback };
//# sourceMappingURL=idle-callback.d.ts.map