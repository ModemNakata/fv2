//#region src/dom/utils/layout.d.ts
declare function forceLayout(element: HTMLElement | null): void;
type PositioningBoundary = 'viewport' | 'container' | (string & {}) | Element | null | undefined;
interface ResolvePositioningBoundaryOptions {
  container?: Element | null;
  root?: Document | ShadowRoot | Element | null;
}
declare function createDOMRect(left: number, top: number, width: number, height: number): DOMRect;
declare function intersectDOMRects(firstRect: DOMRect, secondRect: DOMRect): DOMRect;
declare function getPositioningBoundaryRect(boundaryElement?: Element | null): DOMRect;
declare function resolvePositioningBoundary(boundary: PositioningBoundary, options?: ResolvePositioningBoundaryOptions): Element | null;
//#endregion
export { PositioningBoundary, ResolvePositioningBoundaryOptions, createDOMRect, forceLayout, getPositioningBoundaryRect, intersectDOMRects, resolvePositioningBoundary };
//# sourceMappingURL=layout.d.ts.map