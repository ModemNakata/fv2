//#region src/events/event-like.d.ts
interface EventLike {
  type: string;
  timeStamp: number;
  isTrusted?: boolean;
}
/**
 * Check if a value looks like an Event (has type and timeStamp).
 *
 * Works with DOM Events, React SyntheticEvents, and RN events.
 */
declare function isEventLike(value: unknown): value is EventLike;
//#endregion
export { EventLike, isEventLike };
//# sourceMappingURL=event-like.d.ts.map