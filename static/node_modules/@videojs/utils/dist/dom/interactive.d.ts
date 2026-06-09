//#region src/dom/interactive.d.ts
declare const INTERACTIVE_SELECTOR: string;
declare const EDITABLE_SELECTOR: string;
declare function isEditableElement(el: Element): boolean;
/** Whether the keyboard event target is an editable element (input, textarea, etc). */
declare function isEditableTarget(event: KeyboardEvent): boolean;
/** Whether the event originated from an interactive control (button, slider, etc). */
declare function isInteractiveTarget(event: Event): boolean;
/** Whether the event is an activation key on an activatable element (button, link, slider). */
declare function isInteractiveActivation(event: KeyboardEvent): boolean;
//#endregion
export { EDITABLE_SELECTOR, INTERACTIVE_SELECTOR, isEditableElement, isEditableTarget, isInteractiveActivation, isInteractiveTarget };
//# sourceMappingURL=interactive.d.ts.map