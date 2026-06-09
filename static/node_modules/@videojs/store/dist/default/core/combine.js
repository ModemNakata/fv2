//#region src/core/combine.ts
/**
* Combines multiple slices into a single slice.
*
* @param slices - The slices to combine.
* @returns A new slice that represents the combination of the input slices.
*/
function combine(...slices) {
	return {
		state: (ctx) => {
			const states = slices.map((slice) => slice.state(ctx));
			return Object.assign({}, ...states);
		},
		attach: (ctx) => {
			for (const slice of slices) try {
				slice.attach?.(ctx);
			} catch (err) {
				ctx.reportError(err);
			}
		}
	};
}
//#endregion
export { combine };

//# sourceMappingURL=combine.js.map