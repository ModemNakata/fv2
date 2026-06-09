import { defineBehavior } from "../../../core/composition/create-composition.js";
import { effect } from "../../../core/signals/effect.js";
import { listen } from "@videojs/utils/dom";
//#region src/playback/behaviors/dom/track-playback-rate.ts
/**
* Mirror `mediaElement.playbackRate` into reactive state. On each `ratechange`
* event, write the new value to `state.playbackRate`. Also syncs immediately
* when a media element becomes available so consumers don't wait for the first
* event.
*
* When no media element is attached, writes `config.defaultPlaybackRate`
* (default-default `1`, matching the HTMLMediaElement spec) so consumers
* always see the rate a freshly attached element would have. Read-only mirror;
* does not push `state.playbackRate` back to the element.
*/
function trackPlaybackRateSetup({ state, context, config }) {
	const defaultPlaybackRate = config?.defaultPlaybackRate ?? 1;
	return effect(() => {
		const mediaElement = context.mediaElement.get();
		if (!mediaElement) {
			state.playbackRate.set(defaultPlaybackRate);
			return;
		}
		const sync = () => state.playbackRate.set(mediaElement.playbackRate);
		sync();
		return listen(mediaElement, "ratechange", sync);
	});
}
const trackPlaybackRate = defineBehavior({
	stateKeys: ["playbackRate"],
	contextKeys: ["mediaElement"],
	setup: trackPlaybackRateSetup
});
//#endregion
export { trackPlaybackRate };

//# sourceMappingURL=track-playback-rate.js.map