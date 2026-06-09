//#region src/media/types/index.ts
/**
* Floating-point tolerance for matching segments by `startTime`. Two
* segments are considered the same position when
* `Math.abs(a.startTime - b.startTime) < SEGMENT_TIME_EPSILON`. Used by
* the source-buffer dedup and segment-loader quality-aware filter to
* tolerate sub-millisecond drift in segment timestamps across multiple
* playlists / quality levels.
*/
const SEGMENT_TIME_EPSILON = 1e-4;
function isResolvedTrack(track) {
	return "segments" in track;
}
/**
* Check if a presentation has duration (at least one track resolved).
* Narrows type to include required duration.
*/
function hasPresentationDuration(presentation) {
	return presentation.duration !== void 0;
}
/**
* Narrows a `MaybeResolvedPresentation` to a fully resolved `Presentation`.
*
* A presentation is resolved once `resolvePresentation` has parsed the
* manifest and populated both `id` and `selectionSets`. Both must be
* present — a partial value with only one of them isn't usable, and
* letting it through would have downstream behaviors crash when they
* access `selectionSets`.
*/
function isResolvedPresentation(presentation) {
	return presentation !== void 0 && presentation.id !== void 0 && presentation.selectionSets !== void 0;
}
//#endregion
export { SEGMENT_TIME_EPSILON, hasPresentationDuration, isResolvedPresentation, isResolvedTrack };

//# sourceMappingURL=index.js.map