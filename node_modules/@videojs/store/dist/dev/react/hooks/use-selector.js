import { shallowEqual } from "../../core/shallow-equal.js";
import { useRef, useSyncExternalStore } from "react";
//#region src/react/hooks/use-selector.ts
/**
* Subscribe to derived state with customizable equality check.
*
* Low-level hook used internally by `useStore` and `useSnapshot`.
*
* @param subscribe - Subscribe function that returns an unsubscribe callback.
* @param getSnapshot - Returns the current snapshot value.
* @param selector - Derives a value from the snapshot.
* @param isEqual - Custom equality function. Defaults to `shallowEqual`.
*/
function useSelector(subscribe, getSnapshot, selector, isEqual = shallowEqual) {
	const cache = useRef(void 0);
	const getSelectedSnapshot = () => {
		const next = selector(getSnapshot());
		if (cache.current !== void 0 && isEqual(cache.current, next)) return cache.current;
		cache.current = next;
		return next;
	};
	return useSyncExternalStore(subscribe, getSelectedSnapshot, getSelectedSnapshot);
}
//#endregion
export { useSelector };

//# sourceMappingURL=use-selector.js.map