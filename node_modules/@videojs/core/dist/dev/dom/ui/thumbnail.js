import { ThumbnailCore } from "../../core/ui/thumbnail/thumbnail-core.js";
import { listen } from "@videojs/utils/dom";
//#region src/dom/ui/thumbnail.ts
function createThumbnail(options) {
	const { getContainer, getImg, onStateChange } = options;
	const core = new ThumbnailCore();
	const abort = new AbortController();
	const signal = abort.signal;
	let loading = false;
	let error = false;
	let naturalWidth = 0;
	let naturalHeight = 0;
	let lastSrc = "";
	let imgBound = false;
	let resizeObserver = null;
	function onImgLoad() {
		const img = getImg();
		if (img) {
			naturalWidth = img.naturalWidth;
			naturalHeight = img.naturalHeight;
		}
		loading = false;
		error = false;
		onStateChange();
	}
	function onImgError() {
		loading = false;
		error = true;
		onStateChange();
	}
	function bindImg(img) {
		listen(img, "load", onImgLoad, { signal });
		listen(img, "error", onImgError, { signal });
	}
	function ensureBindings() {
		if (!imgBound) {
			const img = getImg();
			if (img) {
				bindImg(img);
				imgBound = true;
			}
		}
		if (!resizeObserver) {
			const container = getContainer();
			if (container) {
				resizeObserver = new ResizeObserver(onStateChange);
				resizeObserver.observe(container);
			}
		}
	}
	function updateSrc(url) {
		ensureBindings();
		const src = url ?? "";
		if (src === lastSrc) return;
		lastSrc = src;
		if (src) {
			loading = true;
			error = false;
		} else {
			loading = false;
			error = false;
			naturalWidth = 0;
			naturalHeight = 0;
		}
	}
	function connect() {
		ensureBindings();
		const img = getImg();
		if (img?.complete && lastSrc) {
			if (img.naturalWidth > 0) {
				naturalWidth = img.naturalWidth;
				naturalHeight = img.naturalHeight;
				loading = false;
				error = false;
			} else {
				loading = false;
				error = true;
			}
			onStateChange();
		}
	}
	function destroy() {
		abort.abort();
		resizeObserver?.disconnect();
		resizeObserver = null;
	}
	return {
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		get naturalWidth() {
			return naturalWidth;
		},
		get naturalHeight() {
			return naturalHeight;
		},
		readConstraints() {
			const el = getContainer();
			if (!el) return {
				minWidth: 0,
				maxWidth: Infinity,
				minHeight: 0,
				maxHeight: Infinity
			};
			return core.parseConstraints(getComputedStyle(el));
		},
		updateSrc,
		connect,
		destroy
	};
}
//#endregion
export { createThumbnail };

//# sourceMappingURL=thumbnail.js.map