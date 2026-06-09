import { selectFullscreen, selectPiP, selectPlayback, selectTextTrack, selectTime, selectVolume } from "../store/selectors.js";
import { MEDIA_INPUT_ACTION_OVERRIDES } from "../media-actions.js";
import { isUndefined } from "@videojs/utils/predicate";
//#region src/dom/hotkey/actions.ts
function isHotkeyToggleAction(action) {
	return action.startsWith("toggle");
}
const HOTKEY_ACTIONS = {
	togglePaused({ store }) {
		const playback = selectPlayback(store.state);
		if (!playback) return;
		playback.paused ? playback.play() : playback.pause();
	},
	toggleMuted({ store }) {
		selectVolume(store.state)?.toggleMuted();
	},
	toggleFullscreen({ store }) {
		const fs = selectFullscreen(store.state);
		if (!fs) return;
		fs.fullscreen ? fs.exitFullscreen() : fs.requestFullscreen();
	},
	toggleSubtitles({ store }) {
		selectTextTrack(store.state)?.toggleSubtitles();
	},
	togglePictureInPicture({ store }) {
		const pip = selectPiP(store.state);
		if (!pip) return;
		pip.pip ? pip.exitPictureInPicture() : pip.requestPictureInPicture();
	},
	seekStep: MEDIA_INPUT_ACTION_OVERRIDES.seekStep,
	volumeStep: MEDIA_INPUT_ACTION_OVERRIDES.volumeStep,
	speedUp: MEDIA_INPUT_ACTION_OVERRIDES.speedUp,
	speedDown: MEDIA_INPUT_ACTION_OVERRIDES.speedDown,
	seekToPercent({ store, value, key }) {
		const time = selectTime(store.state);
		if (!time || time.duration <= 0) return;
		let percent;
		if (!isUndefined(value)) percent = value;
		else if (key >= "0" && key <= "9") percent = Number(key) * 10;
		else return;
		time.seek(percent / 100 * time.duration);
	}
};
function resolveHotkeyAction(name) {
	return HOTKEY_ACTIONS[name];
}
//#endregion
export { isHotkeyToggleAction, resolveHotkeyAction };

//# sourceMappingURL=actions.js.map