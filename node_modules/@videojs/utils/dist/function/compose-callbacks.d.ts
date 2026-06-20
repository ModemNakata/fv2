//#region src/function/compose-callbacks.d.ts
/**
 * Composes multiple callbacks into one. All callbacks receive same args, no return value.
 * Returns undefined if no callbacks provided.
 *
 * @example
 * ```ts
 * const onSetup = composeCallbacks(base.onSetup, extension.onSetup);
 * onSetup?.(ctx); // Calls both if defined
 * ```
 */
declare function composeCallbacks<T extends (...args: any[]) => void>(...fns: (T | undefined | null)[]): T | undefined;
//#endregion
export { composeCallbacks };
//# sourceMappingURL=compose-callbacks.d.ts.map