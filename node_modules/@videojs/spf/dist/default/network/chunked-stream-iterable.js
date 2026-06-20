//#region src/network/chunked-stream-iterable.ts
const DEFAULT_MIN_CHUNK_SIZE = 2 ** 17;
/**
* Adapts a `ReadableStream<Uint8Array>` (e.g. `response.body`) into an
* `AsyncIterable<Uint8Array>` that yields chunks no smaller than
* `minChunkSize` bytes. Smaller network chunks are accumulated and yielded
* together once the threshold is met. Any remainder is flushed on stream end.
*
* Errors from the underlying stream propagate naturally — the reader lock is
* always released via `finally`.
*/
var ChunkedStreamIterable = class {
	minChunkSize;
	#readableStream;
	constructor(readableStream, { minChunkSize = DEFAULT_MIN_CHUNK_SIZE } = {}) {
		this.#readableStream = readableStream;
		this.minChunkSize = minChunkSize;
	}
	async *[Symbol.asyncIterator]() {
		let pending;
		const reader = this.#readableStream.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					if (pending) yield pending;
					break;
				}
				pending = pending ? concat(pending, value) : value;
				if (pending.length >= this.minChunkSize) {
					yield pending;
					pending = void 0;
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
};
function concat(a, b) {
	const result = new Uint8Array(a.length + b.length);
	result.set(a);
	result.set(b, a.length);
	return result;
}
//#endregion
export { ChunkedStreamIterable };

//# sourceMappingURL=chunked-stream-iterable.js.map