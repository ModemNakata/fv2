//#region src/dom/utils/log.ts
const warned = /* @__PURE__ */ new Set();
function logMissingFeature(displayName, featureName) {
	const key = `${displayName}:${featureName}`;
	if (warned.has(key)) return;
	warned.add(key);
	console.warn(`${displayName} requires ${featureName} feature`);
}
//#endregion
export { logMissingFeature };

//# sourceMappingURL=log.js.map