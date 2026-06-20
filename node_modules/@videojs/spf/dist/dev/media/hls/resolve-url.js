//#region src/media/hls/resolve-url.ts
/**
* Resolve a potentially relative URL against a base URL using native URL API.
*/
function resolveUrl(url, baseUrl) {
	return new URL(url, baseUrl).href;
}
//#endregion
export { resolveUrl };

//# sourceMappingURL=resolve-url.js.map