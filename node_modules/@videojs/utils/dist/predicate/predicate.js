//#region src/predicate/predicate.ts
function isString(value) {
	return typeof value === "string";
}
function isNumber(value) {
	return typeof value === "number";
}
function isBoolean(value) {
	return typeof value === "boolean";
}
function isFunction(value) {
	return typeof value === "function";
}
function isNull(value) {
	return value === null;
}
function isUndefined(value) {
	return typeof value === "undefined";
}
function isNil(value) {
	return value == null;
}
function isPromise(value) {
	return value instanceof Promise;
}
/**
* Check if a value is an object, excluding null.
*/
function isObject(value) {
	return value !== null && typeof value === "object";
}
/**
* Check if a value is a plain object (not a class instance like Date, Map, etc).
*/
function isPlainObject(value) {
	if (!isObject(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === null || proto === Object.prototype;
}
/**
* Check if a value is an AbortError.
*/
function isAbortError(value) {
	return value instanceof Error && value.name === "AbortError";
}
//#endregion
export { isAbortError, isBoolean, isFunction, isNil, isNull, isNumber, isObject, isPlainObject, isPromise, isString, isUndefined };

//# sourceMappingURL=predicate.js.map