//#region src/dom/ui/event.d.ts
interface UIEvent {
  readonly defaultPrevented?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}
interface UIKeyboardEvent extends UIEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: Node;
  currentTarget: Node;
}
interface UIPointerEvent extends UIEvent {
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;
  buttons: number;
}
interface UIWheelEvent extends UIEvent {
  deltaY: number;
}
interface UIFocusEvent extends UIEvent {
  relatedTarget: EventTarget | null;
}
//#endregion
export { UIEvent, UIFocusEvent, UIKeyboardEvent, UIPointerEvent, UIWheelEvent };
//# sourceMappingURL=event.d.ts.map