//#region src/dom/utils/pointer.d.ts
/** Convert a pointer event position to a 0–100 percent along an element's rect. */
declare function getPercentFromPointerEvent(event: {
  clientX: number;
  clientY: number;
}, rect: DOMRect, orientation: 'horizontal' | 'vertical', isRTL: boolean): number;
//#endregion
export { getPercentFromPointerEvent };
//# sourceMappingURL=pointer.d.ts.map