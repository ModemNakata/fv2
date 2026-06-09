//#region src/media/buffer/back-buffer.ts
/**
* Default back buffer configuration.
*/
const DEFAULT_BACK_BUFFER_CONFIG = { keepSegments: 2 };
/**
* Calculate back buffer flush point.
*
* Determines where to flush old segments from the back buffer.
* Keeps a fixed number of segments behind the current playback position.
*
* Algorithm:
* 1. Find segments before currentTime
* 2. Count back N segments (keepSegments)
* 3. Return startTime of segment N+1 back (flush everything before this)
*
* @param segments - Available segments (should be sorted by startTime)
* @param currentTime - Current playback position in seconds
* @param config - Optional back buffer configuration
* @returns Time in seconds to flush up to (flush range: [0, flushEnd))
*
* @example
* const segments = [
*   { startTime: 0, duration: 6, ... },
*   { startTime: 6, duration: 6, ... },
*   { startTime: 12, duration: 6, ... },
*   { startTime: 18, duration: 6, ... },
* ];
*
* // Playing at 18s, keep 2 segments
* const flushEnd = calculateBackBufferFlushPoint(segments, 18);
* // Returns 6 (flush [0, 6), keep [6-18))
*/
function calculateBackBufferFlushPoint(segments, currentTime, config = DEFAULT_BACK_BUFFER_CONFIG) {
	if (segments.length === 0) return 0;
	const segmentsBefore = segments.filter((seg) => seg.startTime < currentTime);
	if (segmentsBefore.length === 0) return 0;
	const segmentsToFlush = segmentsBefore.length - config.keepSegments;
	if (segmentsToFlush <= 0) return 0;
	if (segmentsToFlush >= segmentsBefore.length) return currentTime;
	return segmentsBefore[segmentsToFlush].startTime;
}
//#endregion
export { DEFAULT_BACK_BUFFER_CONFIG, calculateBackBufferFlushPoint };

//# sourceMappingURL=back-buffer.js.map