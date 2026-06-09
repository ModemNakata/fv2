//#region src/core/ui/poster/poster-core.ts
var PosterCore = class {
	#media = null;
	setMedia(media) {
		this.#media = media;
	}
	getState() {
		return { visible: !this.#media.started };
	}
};
//#endregion
export { PosterCore };

//# sourceMappingURL=poster-core.js.map