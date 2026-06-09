//#region src/media/dom/mse/append-segment.ts
/**
* Append media data to a SourceBuffer.
*
* Accepts either a full ArrayBuffer (single append) or an AsyncIterable of
* Uint8Array chunks (one append per chunk, in order). Waits for `updateend`
* between each call so appends are serialized correctly.
*
* Errors from the SourceBuffer (`error` event) or from the iterable are
* propagated as rejections.
*/
async function appendSegment(sourceBuffer, data, signal) {
	if (data instanceof ArrayBuffer) await appendChunk(sourceBuffer, data);
	else try {
		for await (const chunk of data) {
			if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
			await appendChunk(sourceBuffer, chunk);
		}
	} catch (e) {
		if (e instanceof DOMException && e.name === "AbortError" && !sourceBuffer.updating) try {
			sourceBuffer.abort();
		} catch {}
		throw e;
	}
}
async function appendChunk(sourceBuffer, data) {
	if (sourceBuffer.updating) await new Promise((resolve) => {
		const onUpdateEnd = () => {
			sourceBuffer.removeEventListener("updateend", onUpdateEnd);
			resolve();
		};
		sourceBuffer.addEventListener("updateend", onUpdateEnd);
	});
	return new Promise((resolve, reject) => {
		const onUpdateEnd = () => {
			cleanup();
			resolve();
		};
		const onError = (event) => {
			cleanup();
			reject(/* @__PURE__ */ new Error(`SourceBuffer append error: ${event.type}`));
		};
		const cleanup = () => {
			sourceBuffer.removeEventListener("updateend", onUpdateEnd);
			sourceBuffer.removeEventListener("error", onError);
		};
		sourceBuffer.addEventListener("updateend", onUpdateEnd);
		sourceBuffer.addEventListener("error", onError);
		try {
			sourceBuffer.appendBuffer(data);
		} catch (error) {
			cleanup();
			reject(error);
		}
	});
}
//#endregion
export { appendSegment };

//# sourceMappingURL=append-segment.js.map