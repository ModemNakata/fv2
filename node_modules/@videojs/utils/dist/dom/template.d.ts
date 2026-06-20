//#region src/dom/template.d.ts
/** Create an `HTMLTemplateElement` from an HTML string, or `null` when `document` is unavailable (SSR). */
declare function createTemplate(html: string): HTMLTemplateElement | null;
/** Deep-clone a template's content into a container. */
declare function renderTemplate(container: Element | ShadowRoot, template: HTMLTemplateElement): void;
//#endregion
export { createTemplate, renderTemplate };
//# sourceMappingURL=template.d.ts.map