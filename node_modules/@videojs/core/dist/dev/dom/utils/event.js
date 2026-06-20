import { isFunction } from "@videojs/utils/predicate";
//#region src/dom/utils/event.ts
function isEventWithinElement(event, element) {
	if (!element) return false;
	if (isFunction(event.composedPath)) return event.composedPath().includes(element);
	const target = event.target;
	return target instanceof Node && element.contains(target);
}
//#endregion
export { isEventWithinElement };

//# sourceMappingURL=event.js.map