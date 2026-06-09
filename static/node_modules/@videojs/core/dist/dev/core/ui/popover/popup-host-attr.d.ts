//#region src/core/ui/popover/popup-host-attr.d.ts
/**
 * Hosted floating UI surfaces (popover, menu, tooltip, and future overlays) that support
 * parent-driven lifecycle may set {@link POPUP_HOST_ATTR}. Ancestors can discover them with
 * {@link POPUP_HOST_SELECTOR} and call methods such as `close('imperative-action')` when
 * the element implements that contract.
 */
declare const POPUP_HOST_ATTR = "data-popup";
declare const POPUP_HOST_SELECTOR = "[data-popup]";
//#endregion
export { POPUP_HOST_ATTR, POPUP_HOST_SELECTOR };
//# sourceMappingURL=popup-host-attr.d.ts.map