import { isNumber, isObject, isString } from "../predicate/predicate.js";
//#region src/events/event-like.ts
/**
* Check if a value looks like an Event (has type and timeStamp).
*
* Works with DOM Events, React SyntheticEvents, and RN events.
*/
function isEventLike(value) {
	return isObject(value) && "type" in value && isString(value.type) && "timeStamp" in value && isNumber(value.timeStamp);
}
//#endregion
export { isEventLike };

//# sourceMappingURL=event-like.js.map