import { useSelector } from "./use-selector.js";
import { identity } from "@videojs/utils/function";
//#region src/react/hooks/use-snapshot.ts
function useSnapshot(state, selector, isEqual) {
	return useSelector((cb) => state.subscribe(cb), () => state.current, selector ?? identity, isEqual);
}
//#endregion
export { useSnapshot };

//# sourceMappingURL=use-snapshot.js.map