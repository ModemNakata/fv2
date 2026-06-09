//#region src/dom/time-ranges.ts
/** Converts a TimeRanges object to an array of [start, end] tuples. */
function serializeTimeRanges(ranges) {
	const result = [];
	for (let i = 0; i < ranges.length; i++) result.push([ranges.start(i), ranges.end(i)]);
	return result;
}
//#endregion
export { serializeTimeRanges };

//# sourceMappingURL=time-ranges.js.map