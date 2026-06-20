import { MEDIA_INPUT_ACTION_OVERRIDES } from "../media-actions.js";
import { isFunction } from "@videojs/utils/predicate";
//#region src/dom/gesture/actions.ts
/** Actions that need custom logic beyond `store.state[action]()`. */
const GESTURE_ACTION_OVERRIDES = {
	seekStep: MEDIA_INPUT_ACTION_OVERRIDES.seekStep,
	volumeStep: MEDIA_INPUT_ACTION_OVERRIDES.volumeStep,
	speedUp: MEDIA_INPUT_ACTION_OVERRIDES.speedUp,
	speedDown: MEDIA_INPUT_ACTION_OVERRIDES.speedDown
};
function resolveGestureAction(name) {
	const override = GESTURE_ACTION_OVERRIDES[name];
	if (override) return override;
	return ({ store }) => {
		const method = store.state[name];
		if (isFunction(method)) method();
		else console.warn(`[vjs-gesture] Unknown action: "${name}"`);
	};
}
//#endregion
export { resolveGestureAction };

//# sourceMappingURL=actions.js.map