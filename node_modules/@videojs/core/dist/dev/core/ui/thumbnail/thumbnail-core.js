//#region src/core/ui/thumbnail/thumbnail-core.ts
var ThumbnailCore = class {
	findActiveThumbnail(thumbnails, time) {
		if (thumbnails.length === 0) return void 0;
		let low = 0;
		let high = thumbnails.length - 1;
		let result;
		while (low <= high) {
			const mid = low + high >>> 1;
			const image = thumbnails[mid];
			if (time >= image.startTime) {
				result = image;
				low = mid + 1;
			} else high = mid - 1;
		}
		return result;
	}
	/**
	* Parse CSS constraint strings into numeric `ThumbnailConstraints`.
	*
	* Accepts any object with string `minWidth`/`maxWidth`/`minHeight`/`maxHeight`
	* properties — `CSSStyleDeclaration` satisfies this structurally.
	*/
	parseConstraints(raw) {
		const minW = parseFloat(raw.minWidth);
		const maxW = parseFloat(raw.maxWidth);
		const minH = parseFloat(raw.minHeight);
		const maxH = parseFloat(raw.maxHeight);
		return {
			minWidth: Number.isFinite(minW) ? minW : 0,
			maxWidth: Number.isFinite(maxW) ? maxW : Infinity,
			minHeight: Number.isFinite(minH) ? minH : 0,
			maxHeight: Number.isFinite(maxH) ? maxH : Infinity
		};
	}
	/**
	* Calculate a uniform scale factor that fits `tileWidth × tileHeight` within the
	* given CSS min/max constraints while preserving aspect ratio.
	*
	* - Scales down when the tile exceeds max constraints.
	* - Scales up when the tile is smaller than min constraints.
	* - Returns `1` when no scaling is needed.
	*/
	calculateScale(tileWidth, tileHeight, constraints) {
		const { minWidth, maxWidth, minHeight, maxHeight } = constraints;
		const maxRatio = Math.min(maxWidth / tileWidth, maxHeight / tileHeight);
		const minRatio = Math.max(minWidth / tileWidth, minHeight / tileHeight);
		if (Number.isFinite(maxRatio) && maxRatio < 1) return maxRatio;
		if (Number.isFinite(minRatio) && minRatio > 1) return minRatio;
		return 1;
	}
	/**
	* Compute container and image dimensions for the current thumbnail, scaled to
	* fit within the element's CSS min/max constraints.
	*
	* The container clips the sprite sheet via `overflow: hidden`, and the image is
	* positioned with `transform: translate()` to show the correct tile.
	*/
	resize(thumbnail, imgNaturalWidth, imgNaturalHeight, constraints) {
		const tileWidth = thumbnail.width ?? imgNaturalWidth;
		const tileHeight = thumbnail.height ?? imgNaturalHeight;
		if (!tileWidth || !tileHeight) return void 0;
		const scale = this.calculateScale(tileWidth, tileHeight, constraints);
		const coordX = thumbnail.coords?.x ?? 0;
		const coordY = thumbnail.coords?.y ?? 0;
		const inset = scale !== 1 ? 1 : 0;
		return {
			scale,
			containerWidth: Math.max(0, Math.floor(tileWidth * scale) - inset * 2),
			containerHeight: Math.max(0, Math.floor(tileHeight * scale) - inset * 2),
			imageWidth: Math.ceil(imgNaturalWidth * scale),
			imageHeight: Math.ceil(imgNaturalHeight * scale),
			offsetX: Math.ceil(coordX * scale) + inset,
			offsetY: Math.ceil(coordY * scale) + inset
		};
	}
	getState(loading, error, thumbnail) {
		return {
			loading,
			error,
			hidden: !loading && !thumbnail
		};
	}
	getAttrs(_state) {
		return {
			role: "img",
			"aria-hidden": "true"
		};
	}
};
//#endregion
export { ThumbnailCore };

//# sourceMappingURL=thumbnail-core.js.map