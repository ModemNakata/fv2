//#region src/dom/utils/state-data-attrs.ts
/**
* Convert state object to data attributes.
*
* - `true` → `data-keyname=""`
* - truthy string/number → `data-keyname="value"`
* - falsy → no attribute
*
* @example
* ```ts
* const state = { paused: true, ended: false, volume: 0.5 };
* getStateDataAttrs(state);
* // { 'data-paused': '', 'data-volume': '0.5' }
* ```
*
* When a mapping is provided, only mapped keys are converted.
*/
function getStateDataAttrs(state, map) {
	const attrs = {};
	for (const key in state) {
		if (map && !(key in map)) continue;
		const name = map?.[key] ?? toDataAttrName(key), value = state[key];
		if (value === true) attrs[name] = "";
		else if (value) attrs[name] = String(value);
	}
	return attrs;
}
/**
* Apply state as data attributes to an element.
*
* - `true` → sets `data-keyname=""`
* - truthy string/number → sets `data-keyname="value"`
* - falsy → removes the attribute
*
* @example
* ```ts
* const state = { paused: true, ended: false };
* applyStateDataAttrs(element, state);
* // element has data-paused="", data-ended is removed
* ```
*/
function applyStateDataAttrs(element, state, map) {
	for (const key in state) {
		if (map && !(key in map)) continue;
		const name = map?.[key] ?? toDataAttrName(key), value = state[key];
		if (value === true) element.setAttribute(name, "");
		else if (value) element.setAttribute(name, String(value));
		else element.removeAttribute(name);
	}
}
function toDataAttrName(key) {
	return `data-${key.toLowerCase()}`;
}
//#endregion
export { applyStateDataAttrs, getStateDataAttrs };

//# sourceMappingURL=state-data-attrs.js.map