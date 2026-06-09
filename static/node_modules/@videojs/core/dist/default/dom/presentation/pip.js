import { isFunction } from "@videojs/utils/predicate";
//#region src/dom/presentation/pip.ts
function isPictureInPictureEnabled() {
	if (document.pictureInPictureEnabled) {
		const isSafari = /.*Version\/.*Safari\/.*/.test(navigator.userAgent);
		const isPWA = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
		return !isSafari || !isPWA;
	}
	return isFunction(document.createElement("video").webkitSetPresentationMode);
}
function isPictureInPicture(media) {
	if (media.webkitPresentationMode === "picture-in-picture") return true;
	if (document.pictureInPictureElement === media) return true;
	return media.isPictureInPicture ?? false;
}
async function requestPictureInPicture(media) {
	const webkitVideo = media;
	if (isFunction(webkitVideo.webkitSetPresentationMode)) {
		webkitVideo.webkitSetPresentationMode("picture-in-picture");
		return;
	}
	const video = media;
	if (isFunction(video.requestPictureInPicture)) return video.requestPictureInPicture();
}
async function exitPictureInPicture(media) {
	const webkitVideo = media;
	if (webkitVideo.webkitPresentationMode === "picture-in-picture" && isFunction(webkitVideo.webkitSetPresentationMode)) {
		webkitVideo.webkitSetPresentationMode("inline");
		return;
	}
	if (isFunction(document.exitPictureInPicture)) return document.exitPictureInPicture();
	const video = media;
	if (isFunction(video.exitPictureInPicture)) return video.exitPictureInPicture();
}
//#endregion
export { exitPictureInPicture, isPictureInPicture, isPictureInPictureEnabled, requestPictureInPicture };

//# sourceMappingURL=pip.js.map