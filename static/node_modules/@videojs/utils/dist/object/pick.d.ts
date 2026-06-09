//#region src/object/pick.d.ts
/**
 * Creates a new object with only the specified keys.
 *
 * @example
 * const obj = { a: 1, b: 2, c: 3 };
 * pick(obj, ['a', 'c']); // { a: 1, c: 3 }
 */
declare function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K>;
//#endregion
export { pick };
//# sourceMappingURL=pick.d.ts.map