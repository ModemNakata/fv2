//#region src/object/omit.d.ts
/**
 * Creates a new object without the specified keys.
 *
 * @example
 * const obj = { a: 1, b: 2, c: 3 };
 * omit(obj, ['b']); // { a: 1, c: 3 }
 */
declare function omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K>;
//#endregion
export { omit };
//# sourceMappingURL=omit.d.ts.map