//#region src/dom/listen.d.ts
/**
 * Add an event listener and return a cleanup function to remove it.
 *
 * @example
 * ```ts
 * const cleanup = listen(video, 'play', () => console.log('playing'));
 * cleanup(); // Remove listener
 * ```
 */
declare function listen<K extends keyof HTMLMediaElementEventMap>(target: HTMLMediaElement, type: K, listener: (event: HTMLMediaElementEventMap[K]) => void, options?: AddEventListenerOptions): () => void;
declare function listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, listener: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions): () => void;
declare function listen<K extends keyof WindowEventMap>(target: Window, type: K, listener: (event: WindowEventMap[K]) => void, options?: AddEventListenerOptions): () => void;
declare function listen<K extends keyof DocumentEventMap>(target: Document, type: K, listener: (event: DocumentEventMap[K]) => void, options?: AddEventListenerOptions): () => void;
declare function listen(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): () => void;
//#endregion
export { listen };
//# sourceMappingURL=listen.d.ts.map