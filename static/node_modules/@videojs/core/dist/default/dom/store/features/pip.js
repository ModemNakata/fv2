import { definePlayerFeature } from "../../feature.js";
import { exitFullscreen, isFullscreen } from "../../presentation/fullscreen.js";
import { exitPictureInPicture, isPictureInPicture, isPictureInPictureEnabled, requestPictureInPicture } from "../../presentation/pip.js";
import { listen } from "@videojs/utils/dom";
//#region src/dom/store/features/pip.ts
const pipFeature = definePlayerFeature({
	name: "pip",
	state: ({ target }) => ({
		pip: false,
		pipAvailability: "unavailable",
		async requestPictureInPicture() {
			const { media, container } = target();
			if (isFullscreen(container, media)) await exitFullscreen(media);
			return requestPictureInPicture(media);
		},
		async exitPictureInPicture() {
			const { media } = target();
			return exitPictureInPicture(media);
		},
		async togglePictureInPicture() {
			const { media, container } = target();
			if (isPictureInPicture(media)) return exitPictureInPicture(media);
			if (isFullscreen(container, media)) await exitFullscreen(media);
			return requestPictureInPicture(media);
		}
	}),
	attach({ target, signal, set }) {
		const { media } = target;
		set({ pipAvailability: isPictureInPictureEnabled() ? "available" : "unsupported" });
		const sync = () => set({ pip: isPictureInPicture(media) });
		sync();
		listen(media, "enterpictureinpicture", sync, { signal });
		listen(media, "leavepictureinpicture", sync, { signal });
		if ("webkitPresentationMode" in media) listen(media, "webkitpresentationmodechanged", sync, { signal });
	}
});
//#endregion
export { pipFeature };

//# sourceMappingURL=pip.js.map