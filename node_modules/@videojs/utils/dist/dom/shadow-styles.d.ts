//#region src/dom/shadow-styles.d.ts
type ShadowStyle = CSSStyleSheet | string;
/** Inject a `<style>` tag into `document.head` once (idempotent by `id`). */
declare function ensureGlobalStyle(id: string, css: string): void;
/** Create a constructable stylesheet when available, otherwise return raw CSS. */
declare function createShadowStyle(css: string): ShadowStyle;
/** Apply styles to a shadow root using `adoptedStyleSheets` when available, falling back to `<style>` injection. */
declare function applyShadowStyles(shadowRoot: ShadowRoot, styles: ShadowStyle[]): void;
//#endregion
export { ShadowStyle, applyShadowStyles, createShadowStyle, ensureGlobalStyle };
//# sourceMappingURL=shadow-styles.d.ts.map