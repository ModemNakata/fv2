import { computed, peek } from "../../core/signals/primitives.js";
import { defineBehavior } from "../../core/composition/create-composition.js";
import { effect } from "../../core/signals/effect.js";
import { isStandardPreload } from "../../media/utils/preload.js";
//#region src/playback/behaviors/sync-preload.ts
/**
* **Bidirectional sync between `state.preload` and `mediaElement.preload`.**
*
* Two effects:
* - **Read (DOM → state)** — on `context.mediaElement` swap or
*   `state.presentation.url` change, copies `mediaElement.preload` into
*   `state.preload` if it's a W3C value and `state.preload` isn't holding
*   an extended (non-W3C) value. When the DOM has no W3C opinion and
*   `state.preload` is undefined, backfills from `config.defaultPreload`
*   (default-default `'metadata'`) so `state.preload` is never undefined
*   in steady state.
* - **Write (state → DOM)** — on `state.preload` change or
*   `context.mediaElement` swap, writes `state.preload` back to
*   `mediaElement.preload` if the value is W3C.
*
* Extended values (e.g. `'canplay'`) written externally to `state.preload`
* are sticky: read won't overwrite them, write won't push them to the DOM.
* All writes are deduped to break echo loops and avoid spurious re-triggers
* downstream (notably `resolvePresentation`, which reads `state.preload`).
*/
function syncPreloadSetup({ state, context, config }) {
	const defaultPreload = config?.defaultPreload ?? "metadata";
	const presentationUrl = computed(() => state.presentation.get()?.url);
	const cleanupRead = effect(() => {
		presentationUrl.get();
		const mediaElement = context.mediaElement.get();
		const current = peek(state.preload);
		if (current !== void 0 && !isStandardPreload(current)) return;
		const target = mediaElement && isStandardPreload(mediaElement.preload) ? mediaElement.preload : current === void 0 ? defaultPreload : void 0;
		if (target === void 0 || target === current) return;
		state.preload.set(target);
	});
	const cleanupWrite = effect(() => {
		const next = state.preload.get();
		const mediaElement = context.mediaElement.get();
		if (!mediaElement) return;
		if (!isStandardPreload(next)) return;
		if (mediaElement.preload === next) return;
		mediaElement.preload = next;
	});
	return () => {
		cleanupRead();
		cleanupWrite();
	};
}
const syncPreload = defineBehavior({
	stateKeys: ["preload", "presentation"],
	contextKeys: ["mediaElement"],
	setup: syncPreloadSetup
});
//#endregion
export { syncPreload };

//# sourceMappingURL=sync-preload.js.map