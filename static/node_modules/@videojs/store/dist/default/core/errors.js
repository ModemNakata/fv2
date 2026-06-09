//#region src/core/errors.ts
var StoreError = class extends Error {
	code;
	cause;
	constructor(code, options) {
		super(options?.message ?? code);
		this.name = "StoreError";
		this.code = code;
		this.cause = options?.cause;
	}
};
function isStoreError(error) {
	return error instanceof StoreError;
}
function throwNoTargetError() {
	throw new StoreError("NO_TARGET");
}
function throwDestroyedError() {
	throw new StoreError("DESTROYED");
}
//#endregion
export { StoreError, isStoreError, throwDestroyedError, throwNoTargetError };

//# sourceMappingURL=errors.js.map