//#region src/dom/template.ts
/** Create an `HTMLTemplateElement` from an HTML string, or `null` when `document` is unavailable (SSR). */
function createTemplate(html) {
	const doc = globalThis.document;
	if (!doc) return null;
	const template = doc.createElement("template");
	template.innerHTML = html;
	return template;
}
/** Deep-clone a template's content into a container. */
function renderTemplate(container, template) {
	container.appendChild(container.ownerDocument.importNode(template.content, true));
}
//#endregion
export { createTemplate, renderTemplate };

//# sourceMappingURL=template.js.map