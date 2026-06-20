//#region src/media/utils/preload.ts
function isStandardPreload(value) {
	return value === "auto" || value === "metadata" || value === "none";
}
/**
* Default `preload` value used as the fallback across behaviors
* (`syncPreload`, `resolvePresentation`, `isBlockingPreload`). Matches the
* `<video>`/`<audio>` element's implicit default.
*/
const DEFAULT_PRELOAD = "metadata";
/**
* True when the preload value blocks initial resolution / loading.
* Falsy values (undefined, empty) fall back to `defaultPreload` (default
* `DEFAULT_PRELOAD`); the resolved value blocks iff it is `'none'`.
*/
function isBlockingPreload(preload, defaultPreload = DEFAULT_PRELOAD) {
	return (preload || defaultPreload) === "none";
}
//#endregion
export { DEFAULT_PRELOAD, isBlockingPreload, isStandardPreload };

//# sourceMappingURL=preload.js.map