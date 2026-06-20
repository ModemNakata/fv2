//#region src/dom/attributes.d.ts
/**
 * Convert a NamedNodeMap to a plain object.
 */
declare function namedNodeMapToObject(namedNodeMap: NamedNodeMap): Record<string, string>;
/**
 * Helper function to serialize attributes into a string.
 */
declare function serializeAttributes(attrs: Record<string, string>): string;
//#endregion
export { namedNodeMapToObject, serializeAttributes };
//# sourceMappingURL=attributes.d.ts.map