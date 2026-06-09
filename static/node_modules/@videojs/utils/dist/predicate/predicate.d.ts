//#region src/predicate/predicate.d.ts
declare function isString(value: unknown): value is string;
declare function isNumber(value: unknown): value is number;
declare function isBoolean(value: unknown): value is boolean;
declare function isFunction(value: unknown): value is (...args: any[]) => any;
declare function isNull(value: unknown): value is null;
declare function isUndefined(value: unknown): value is undefined;
declare function isNil(value: unknown): value is null | undefined;
declare function isPromise(value: unknown): value is Promise<any>;
/**
 * Check if a value is an object, excluding null.
 */
declare function isObject(value: unknown): value is object;
/**
 * Check if a value is a plain object (not a class instance like Date, Map, etc).
 */
declare function isPlainObject(value: unknown): value is Record<string, unknown>;
/**
 * Check if a value is an AbortError.
 */
declare function isAbortError(value: unknown): value is Error;
//#endregion
export { isAbortError, isBoolean, isFunction, isNil, isNull, isNumber, isObject, isPlainObject, isPromise, isString, isUndefined };
//# sourceMappingURL=predicate.d.ts.map