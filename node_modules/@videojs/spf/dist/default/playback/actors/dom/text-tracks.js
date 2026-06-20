import { createTransitionActor } from "../../../core/actors/create-transition-actor.js";
//#region src/playback/actors/dom/text-tracks.ts
function isDuplicateCue(cue, existing) {
	return existing.some((r) => r.startTime === cue.startTime && r.endTime === cue.endTime && r.text === cue.text);
}
/** TextTrack actor: wraps all text tracks on a media element, owns cue operations. */
function createTextTracksActor(mediaElement) {
	return createTransitionActor({
		loaded: {},
		segments: {}
	}, (context, message) => {
		if (message.type === "clear") return {
			loaded: {},
			segments: {}
		};
		const { meta, cues } = message;
		const { trackId, id: segmentId, startTime, duration } = meta;
		const textTrack = Array.from(mediaElement.textTracks).find((t) => t.id === trackId);
		if (!textTrack) return context;
		const existingCues = context.loaded[trackId] ?? [];
		const existingSegments = context.segments[trackId] ?? [];
		const prunedCues = cues.filter((cue) => !isDuplicateCue(cue, existingCues));
		const segmentAlreadyLoaded = existingSegments.some((s) => s.id === segmentId);
		if (prunedCues.length === 0 && segmentAlreadyLoaded) return context;
		for (const cue of prunedCues) textTrack.addCue(cue);
		return {
			...context,
			loaded: {
				...context.loaded,
				[trackId]: [...existingCues, ...prunedCues]
			},
			segments: segmentAlreadyLoaded ? context.segments : {
				...context.segments,
				[trackId]: [...existingSegments, {
					id: segmentId,
					startTime,
					duration
				}]
			}
		};
	});
}
//#endregion
export { createTextTracksActor };

//# sourceMappingURL=text-tracks.js.map