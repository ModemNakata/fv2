import { useSelector } from "./use-selector.js";
import { identity, noop } from "@videojs/utils/function";
//#region src/react/hooks/use-store.ts
const noopSubscribe = () => noop;
function useStore(store, selector, isEqual) {
	return useSelector(selector ? (cb) => store.subscribe(cb) : noopSubscribe, selector ? () => store.state : () => store, selector ?? identity, isEqual);
}
//#endregion
export { useStore };

//# sourceMappingURL=use-store.js.map