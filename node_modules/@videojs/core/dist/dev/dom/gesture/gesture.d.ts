//#region src/dom/gesture/gesture.d.ts
type GesturePointerType = 'mouse' | 'touch' | 'pen';
type GestureType = 'tap' | 'doubletap';
type GestureRegion = 'left' | 'center' | 'right';
interface GestureOptions {
  pointer?: GesturePointerType | undefined;
  region?: GestureRegion | undefined;
  disabled?: boolean | undefined;
  action?: string | undefined;
  value?: number | undefined;
}
interface GestureBinding {
  type: GestureType;
  recognizer: GestureRecognizer;
  onActivate: (event: PointerEvent) => void;
  pointer?: GesturePointerType | undefined;
  region?: GestureRegion | undefined;
  disabled?: boolean | undefined;
  action?: string | undefined;
  value?: number | undefined;
}
interface GestureActivateEvent {
  type: GestureType;
  source: 'gesture';
  action?: string | undefined;
  value?: number | undefined;
  region?: GestureRegion | undefined;
  pointer?: GesturePointerType | undefined;
  event: PointerEvent;
}
interface GestureRecognizer {
  /** Handle a confirmed quick pointer-up and decide when to fire matched bindings. */
  handleUp(matches: GestureMatchResult, event: PointerEvent): void;
  reset(): void;
}
interface GestureMatchResult {
  /** Resolve current matches for a gesture type (reads fresh rect, re-filters bindings). */
  resolve(type: GestureType): GestureBinding[];
}
//#endregion
export { GestureActivateEvent, GestureBinding, GestureMatchResult, GestureOptions, GesturePointerType, GestureRecognizer, GestureRegion, GestureType };
//# sourceMappingURL=gesture.d.ts.map