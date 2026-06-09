//#region src/string/generate-id.ts
/**
* Generate a unique-ish string ID via timestamp + random.
*
* @returns String in `timestamp-random` format (e.g. `"1738423156789-542891"`).
*
* @example
* const id = generateId(); // "1738423156789-542891"
*/
function generateId() {
	return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
//#endregion
export { generateId };

//# sourceMappingURL=generate-id.js.map