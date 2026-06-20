//#region src/array/uniq-by.d.ts
/**
 * Returns array with duplicates removed, keeping the LAST occurrence.
 * Useful for feature merging where extensions should override base features.
 *
 * @example
 * ```ts
 * const features = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'a', v: 3 }];
 * uniqBy(features, s => s.id);
 * // => [{ id: 'b', v: 2 }, { id: 'a', v: 3 }]
 * ```
 */
declare function uniqBy<T, K>(arr: T[], mapper: (item: T) => K): T[];
//#endregion
export { uniqBy };
//# sourceMappingURL=uniq-by.d.ts.map