//#region src/dom/event.d.ts
/** Resolve the deepest event target, preferring composedPath for shadow DOM. */
declare function resolveEventTarget(event: Event): EventTarget | null;
interface OnEventOptions extends AddEventListenerOptions {
  /**
   * An AbortSignal to cancel waiting for the event.
   *
   * If aborted, the returned promise will reject with an `AbortError`.
   */
  signal?: AbortSignal;
}
/**
 * Wait for an event to occur on a target.
 *
 * @example
 * ```ts
 * const event = await onEvent(video, 'seeked');
 * ```
 */
declare function onEvent<K extends keyof HTMLMediaElementEventMap>(target: HTMLMediaElement, type: K, options?: OnEventOptions): Promise<HTMLMediaElementEventMap[K]>;
declare function onEvent<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, options?: OnEventOptions): Promise<HTMLElementEventMap[K]>;
declare function onEvent<K extends keyof WindowEventMap>(target: Window, type: K, options?: OnEventOptions): Promise<WindowEventMap[K]>;
declare function onEvent<K extends keyof DocumentEventMap>(target: Document, type: K, options?: OnEventOptions): Promise<DocumentEventMap[K]>;
declare function onEvent(target: EventTarget, type: string, options?: OnEventOptions): Promise<Event>;
//#endregion
export { OnEventOptions, onEvent, resolveEventTarget };
//# sourceMappingURL=event.d.ts.map