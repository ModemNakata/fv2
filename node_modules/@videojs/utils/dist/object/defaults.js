import { isUndefined } from "../predicate/predicate.js";
//#region src/object/defaults.ts
/**
* Creates a new object with default values filled in for undefined properties.
*
* @example
* ```ts
* const props = { label: undefined, disabled: true };
* const defaultProps = { label: '', disabled: false };
* defaults(props, defaultProps); // { label: '', disabled: true }
* ```
*/
function defaults(object, defaultValues) {
	const result = { ...defaultValues };
	for (const key in object) if (!isUndefined(object[key])) result[key] = object[key];
	return result;
}
//#endregion
export { defaults };

//# sourceMappingURL=defaults.js.map