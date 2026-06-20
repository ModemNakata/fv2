//#region src/function/try-catch.d.ts
/**
 * Wrap a function to catch and handle errors instead of throwing.
 *
 * @example
 * ```ts
 * const safeFn = tryCatch(riskyFn, (e) => logger.error(e));
 * safeFn?.(); // Never throws
 * ```
 */
declare function tryCatch<T extends (...args: any[]) => unknown>(fn: T | undefined, onError?: (error: unknown) => void): T | undefined;
//#endregion
export { tryCatch };
//# sourceMappingURL=try-catch.d.ts.map