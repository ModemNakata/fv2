//#region src/media/dom/mse/end-of-stream.ts
/**
* Check if the temporally last segment of `expectedSegments` is present in
* `appendedSegments` and not marked partial.
*
* Compares by segment ID rather than by a pipeline flag, so the result
* stays correct across quality switches (different tracks have different
* segment IDs) and back-buffer flushes (flushed segment IDs are removed
* from the appended list).
*/
function isLastSegmentAppended(expectedSegments, appendedSegments) {
	if (expectedSegments.length === 0) return true;
	const lastSeg = expectedSegments[expectedSegments.length - 1];
	if (!lastSeg) return false;
	return appendedSegments?.some((s) => s.id === lastSeg.id && !s.partial) ?? false;
}
//#endregion
export { isLastSegmentAppended };

//# sourceMappingURL=end-of-stream.js.map