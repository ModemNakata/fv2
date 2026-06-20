import { isNumber } from "@videojs/utils/predicate";
//#region src/core/ui/thumbnail/thumbnail-media-fragment.ts
/** Parse `url#xywh=x,y,w,h` into a URL and optional sprite coordinates. */
function parseMediaFragment(text, baseURL) {
	const parts = text.trim().split("#");
	const rawURL = parts[0] ?? "";
	const hash = parts[1];
	const url = baseURL ? new URL(rawURL, baseURL).href : rawURL;
	if (!hash) return { url };
	const eqIndex = hash.indexOf("=");
	if (eqIndex === -1) return { url };
	const keys = hash.slice(0, eqIndex);
	const values = hash.slice(eqIndex + 1).split(",").map(Number);
	const data = {};
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const value = values[i];
		if (key && isNumber(value) && !Number.isNaN(value)) data[key] = value;
	}
	const result = { url };
	if (isNumber(data.w)) result.width = data.w;
	if (isNumber(data.h)) result.height = data.h;
	if (isNumber(data.x) && isNumber(data.y)) result.coords = {
		x: data.x,
		y: data.y
	};
	return result;
}
/**
* Convert an array of text cues (e.g. `VTTCue` from a `<track>` element)
* into {@link ThumbnailImage} entries by parsing the media-fragment in
* each cue's text.
*/
function mapCuesToThumbnails(cues, baseURL) {
	const images = [];
	for (const cue of cues) {
		const fragment = parseMediaFragment(cue.text, baseURL);
		const image = {
			url: fragment.url,
			startTime: cue.startTime,
			endTime: cue.endTime
		};
		if (fragment.width) image.width = fragment.width;
		if (fragment.height) image.height = fragment.height;
		if (fragment.coords) image.coords = fragment.coords;
		images.push(image);
	}
	return images;
}
//#endregion
export { mapCuesToThumbnails, parseMediaFragment };

//# sourceMappingURL=thumbnail-media-fragment.js.map