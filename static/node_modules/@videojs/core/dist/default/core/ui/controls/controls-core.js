//#region src/core/ui/controls/controls-core.ts
var ControlsCore = class {
	#media = null;
	setMedia(media) {
		this.#media = media;
	}
	getState() {
		const media = this.#media;
		return {
			visible: media.controlsVisible,
			userActive: media.userActive
		};
	}
};
//#endregion
export { ControlsCore };

//# sourceMappingURL=controls-core.js.map