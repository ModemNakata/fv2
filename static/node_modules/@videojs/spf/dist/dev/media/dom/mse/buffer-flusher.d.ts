//#region src/media/dom/mse/buffer-flusher.d.ts
/**
 * Buffer flusher helper (P12)
 *
 * Removes a time range from a SourceBuffer to manage memory.
 */
/**
 * Remove a time range from a SourceBuffer.
 *
 * Waits for the SourceBuffer to be ready (not updating), then removes
 * the specified range. Returns a promise that resolves when removal completes.
 *
 * @param sourceBuffer - The SourceBuffer to remove data from
 * @param start - Start of the time range to remove (seconds)
 * @param end - End of the time range to remove (seconds)
 * @returns Promise that resolves when removal completes
 *
 * @example
 * await flushBuffer(videoSourceBuffer, 0, 30);
 */
declare function flushBuffer(sourceBuffer: SourceBuffer, start: number, end: number): Promise<void>;
//#endregion
export { flushBuffer };
//# sourceMappingURL=buffer-flusher.d.ts.map