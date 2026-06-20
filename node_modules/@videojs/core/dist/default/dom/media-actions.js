import { selectPlaybackRate, selectTime, selectVolume } from "./store/selectors.js";
import { isUndefined } from "@videojs/utils/predicate";
//#region src/dom/media-actions.ts
const MEDIA_INPUT_ACTION_OVERRIDES = {
	seekStep({ store, value }) {
		if (isUndefined(value)) return;
		const time = selectTime(store.state);
		if (!time) return;
		time.seek(time.currentTime + value);
	},
	volumeStep({ store, value }) {
		if (isUndefined(value)) return;
		const vol = selectVolume(store.state);
		if (!vol) return;
		vol.setVolume(vol.volume + value);
	},
	speedUp({ store }) {
		const rate = selectPlaybackRate(store.state);
		if (!rate) return;
		const { playbackRates, playbackRate } = rate;
		const idx = playbackRates.indexOf(playbackRate);
		const next = idx < 0 || idx >= playbackRates.length - 1 ? 0 : idx + 1;
		rate.setPlaybackRate(playbackRates[next]);
	},
	speedDown({ store }) {
		const rate = selectPlaybackRate(store.state);
		if (!rate) return;
		const { playbackRates, playbackRate } = rate;
		const idx = playbackRates.indexOf(playbackRate);
		const next = idx <= 0 ? playbackRates.length - 1 : idx - 1;
		rate.setPlaybackRate(playbackRates[next]);
	}
};
//#endregion
export { MEDIA_INPUT_ACTION_OVERRIDES };

//# sourceMappingURL=media-actions.js.map