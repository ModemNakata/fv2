import { AbortControllerRegistry } from "./abort-controller-registry.js";
import { throwNoTargetError } from "./errors.js";
import { pick } from "@videojs/utils/object";
//#region src/core/selector.ts
const stateContext = {
	target: throwNoTargetError,
	signals: new AbortControllerRegistry(),
	get: throwNoTargetError,
	set: throwNoTargetError
};
/**
* Create a type-safe selector for a slice's state.
*
* The selector returns the slice's state, or `undefined` if the slice
* is not configured in the store.
*
* @example
* ```ts
* const selectPlayback = createSelector(playbackSlice);
* selectPlayback(store.state); // { paused, play, pause, ... } | undefined
* selectPlayback.displayName;  // 'playback' (from slice name)
* ```
*
* @param slice - The slice to create a selector for.
*/
function createSelector(slice) {
	const initialState = slice.state(stateContext);
	const keys = Object.keys(initialState);
	const firstKey = keys[0];
	if (!firstKey) return Object.assign(() => void 0, { displayName: slice.name });
	return Object.assign((state) => {
		if (!(firstKey in state)) return void 0;
		return pick(state, keys);
	}, { displayName: slice.name });
}
//#endregion
export { createSelector };

//# sourceMappingURL=selector.js.map