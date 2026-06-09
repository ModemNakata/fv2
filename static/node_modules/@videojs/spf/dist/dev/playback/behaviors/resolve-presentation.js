import { computed } from "../../core/signals/primitives.js";
import { defineBehavior } from "../../core/composition/create-composition.js";
import { createMachineReactor } from "../../core/reactors/create-machine-reactor.js";
import { isResolvedPresentation } from "../../media/types/index.js";
import { fetchResolvable, getResponseText } from "../../network/fetch.js";
import { isBlockingPreload } from "../../media/utils/preload.js";
//#region src/playback/behaviors/resolve-presentation.ts
/**
* **Resolve an unresolved presentation by fetching and parsing its manifest.**
*
* Reads `state.presentation`; when it holds `{ url }` (unresolved) and the
* preload / load-activation gate is met, fetches the manifest, parses it via
* the **required** `config.parsePresentation`, and writes the resolved
* `Presentation` back to the same slot. The behavior is format-neutral: the
* composing engine wires in its parser (e.g. the HLS engine supplies the
* multivariant-playlist parser).
*
* Source-identity-driven, expressed as a 4-state machine:
*
* ```
* 'preconditions-unmet' → 'idle' → 'resolving' → 'resolved'
* ```
*
* - `'preconditions-unmet'`: no presentation, or presentation has no URL.
* - `'idle'`: URL present, unresolved, gate unmet (blocking preload + no
*   load-activation). Waits for the gate to open.
* - `'resolving'`: URL present, unresolved, gate met. Entry starts the fetch
*   and returns the AbortController — the reactor calls `.abort()` on state
*   exit, so source change / gate-close / destroy all cancel cleanly.
* - `'resolved'`: `state.presentation` holds a resolved `Presentation`.
*
* Gate semantics: `state.preload` (or `config.defaultPreload`, default
* `'metadata'`, when state.preload is unset) blocks resolution when its
* value is `'none'` (see `isBlockingPreload` in `media/utils/preload`).
* `state.loadActivated` is an override — true bypasses the preload gate
* entirely.
*
* Multi-writer with the engine adapter, which writes the initial unresolved
* `{ url }` to `state.presentation` from src input. Different domains
* (config-input vs. derived state via fetch) — legitimate multi-writer.
*/
function deriveState(presentation, preload, loadActivated, defaultPreload) {
	if (!presentation?.url) return "preconditions-unmet";
	if (isResolvedPresentation(presentation)) return "resolved";
	return !!loadActivated || !isBlockingPreload(preload, defaultPreload) ? "resolving" : "idle";
}
function resolvePresentationSetup({ state, config }) {
	const { parsePresentation } = config;
	const defaultPreload = config.defaultPreload ?? "metadata";
	const derivedStateSignal = computed(() => deriveState(state.presentation.get(), state.preload.get(), state.loadActivated.get(), defaultPreload));
	return createMachineReactor({
		initial: "preconditions-unmet",
		monitor: () => derivedStateSignal.get(),
		states: {
			"preconditions-unmet": {},
			idle: {},
			resolving: { entry: () => {
				const presentation = state.presentation.get();
				const ac = new AbortController();
				fetchResolvable(presentation, { signal: ac.signal }).then((response) => getResponseText(response)).then((text) => {
					const parsed = parsePresentation(text, presentation);
					state.presentation.set(parsed);
				}).catch((error) => {
					if (error instanceof Error && error.name === "AbortError") return;
					console.error("[resolvePresentation] manifest fetch/parse failed:", error);
				});
				return ac;
			} },
			resolved: {}
		}
	});
}
const resolvePresentation = defineBehavior({
	stateKeys: [
		"presentation",
		"preload",
		"loadActivated"
	],
	contextKeys: [],
	setup: resolvePresentationSetup
});
//#endregion
export { resolvePresentation };

//# sourceMappingURL=resolve-presentation.js.map