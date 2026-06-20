//#region src/object/omit.ts
/**
* Creates a new object without the specified keys.
*
* @example
* const obj = { a: 1, b: 2, c: 3 };
* omit(obj, ['b']); // { a: 1, c: 3 }
*/
function omit(obj, keys) {
	const result = {};
	for (const key in obj) if (!keys.includes(key)) result[key] = obj[key];
	return result;
}
//#endregion
export { omit };

//# sourceMappingURL=omit.js.map