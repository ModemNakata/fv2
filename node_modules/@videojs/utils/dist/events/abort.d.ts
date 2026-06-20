//#region src/events/abort.d.ts
/**
 * Compose multiple abort signals into one that aborts when **any** input fires.
 * Uses native `AbortSignal.any` when available, otherwise falls back to a
 * manual `AbortController` composition for Chromium ≤115 and similar runtimes.
 */
declare function anyAbortSignal(signals: AbortSignal[]): AbortSignal;
/**
 * Race a promise against an abort signal. Rejects immediately if the signal
 * is already aborted or becomes aborted before the promise settles.
 */
declare function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T>;
//#endregion
export { abortable, anyAbortSignal };
//# sourceMappingURL=abort.d.ts.map