//#region src/dom/utils/element-props.d.ts
/**
 * Apply props to a DOM element.
 *
 * Handles both attributes and event listeners:
 * - Event props (onClick, onKeyDown, etc.) are attached as listeners
 * - Boolean props: `true` sets empty attribute, `false` removes
 * - `undefined` removes the attribute
 * - Other props are set as string attributes
 */
declare function applyElementProps(element: HTMLElement, props: object, options?: {
  signal?: AbortSignal;
}): void;
//#endregion
export { applyElementProps };
//# sourceMappingURL=element-props.d.ts.map