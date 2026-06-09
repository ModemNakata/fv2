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
			{
				const seen = /* @__PURE__ */ new Set();
				for (const state of states) for (const key of Object.keys(state)) {
					if (seen.has(key)) console.warn(`[vjs-store] combine(): duplicate state key "${key}" — later slice overwrites earlier one`);
					seen.add(key);
				}
			}
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