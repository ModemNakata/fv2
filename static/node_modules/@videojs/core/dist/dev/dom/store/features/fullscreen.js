import { definePlayerFeature } from "../../feature.js";
import { exitFullscreen, isFullscreen, isFullscreenEnabled, requestFullscreen } from "../../presentation/fullscreen.js";
import { exitPictureInPicture, isPictureInPicture } from "../../presentation/pip.js";
import { listen } from "@videojs/utils/dom";
//#region src/dom/store/features/fullscreen.ts
const fullscreenFeature = definePlayerFeature({
	name: "fullscreen",
	state: ({ target }) => ({
		fullscreen: false,
		fullscreenAvailability: "unavailable",
		async requestFullscreen() {
			const { media, container } = target();
			if (isPictureInPicture(media)) await exitPictureInPicture(media);
			return requestFullscreen(container, media);
		},
		async exitFullscreen() {
			const { media } = target();
			return exitFullscreen(media);
		},
		async toggleFullscreen() {
			const { media, container } = target();
			if (isFullscreen(container, media)) return exitFullscreen(media);
			if (isPictureInPicture(media)) await exitPictureInPicture(media);
			return requestFullscreen(container, media);
		}
	}),
	attach({ target, signal, set }) {
		const { media, container } = target;
		set({ fullscreenAvailability: isFullscreenEnabled() ? "available" : "unsupported" });
		const sync = () => set({ fullscreen: isFullscreen(container, media) });
		sync();
		listen(document, "fullscreenchange", sync, { signal });
		listen(document, "webkitfullscreenchange", sync, { signal });
		if ("webkitPresentationMode" in media) listen(media, "webkitpresentationmodechanged", sync, { signal });
	}
});
//#endregion
export { fullscreenFeature };

//# sourceMappingURL=fullscreen.js.map