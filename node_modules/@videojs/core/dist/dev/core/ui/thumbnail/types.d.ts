//#region src/core/ui/thumbnail/types.d.ts
interface ThumbnailCoords {
  x: number;
  y: number;
}
interface ThumbnailImage {
  url: string;
  startTime: number;
  endTime?: number;
  width?: number;
  height?: number;
  coords?: ThumbnailCoords;
}
type ThumbnailSrc = string | ThumbnailImage[] | null;
type ThumbnailCrossOrigin = 'anonymous' | 'use-credentials' | '' | null;
type ThumbnailLoading = 'eager' | 'lazy';
type ThumbnailFetchPriority = 'high' | 'low' | 'auto';
interface ThumbnailConstraints {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}
interface ThumbnailResizeResult {
  scale: number;
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  offsetX: number;
  offsetY: number;
}
//#endregion
export { ThumbnailConstraints, ThumbnailCoords, ThumbnailCrossOrigin, ThumbnailFetchPriority, ThumbnailImage, ThumbnailLoading, ThumbnailResizeResult, ThumbnailSrc };
//# sourceMappingURL=types.d.ts.map