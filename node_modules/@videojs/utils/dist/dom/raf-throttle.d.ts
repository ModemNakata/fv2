//#region src/dom/raf-throttle.d.ts
/** A throttled function that can be cancelled. */
interface RafThrottled<Args extends unknown[]> {
  (...args: Args): void;
  /** Cancel any pending animation frame. */
  cancel(): void;
}
/** Throttle a function to fire at most once per animation frame. */
declare function rafThrottle<Args extends unknown[]>(fn: (...args: Args) => void): RafThrottled<Args>;
//#endregion
export { RafThrottled, rafThrottle };
//# sourceMappingURL=raf-throttle.d.ts.map