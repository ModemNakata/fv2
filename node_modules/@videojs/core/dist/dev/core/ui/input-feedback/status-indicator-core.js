import { IndicatorCloseController, getIndicatorCloseDelay } from "./indicator-lifecycle.js";
import { DEFAULT_INPUT_INDICATOR_LABELS, deriveStatus, isInputActionIncluded } from "./status.js";
import { createState } from "@videojs/store";
//#region src/core/ui/input-feedback/status-indicator-core.ts
const INITIAL_STATE = {
	open: false,
	generation: 0,
	status: null,
	label: null,
	value: null,
	transitionStarting: false,
	transitionEnding: false
};
var StatusIndicatorCore = class {
	state = createState({ ...INITIAL_STATE });
	#props = {};
	#close = new IndicatorCloseController(() => this.state.patch({
		open: false,
		status: null,
		label: null,
		value: null
	}), () => getIndicatorCloseDelay(this.#props));
	setProps(props) {
		this.#props = props;
	}
	destroy() {
		this.#close.destroy();
	}
	close() {
		this.#close.close();
	}
	processEvent(event, snapshot) {
		if (!isInputActionIncluded(event.action, this.#props.actions)) return false;
		const details = deriveStatus(event, snapshot, {
			...DEFAULT_INPUT_INDICATOR_LABELS,
			...this.#props.labels
		});
		if (!details) return false;
		this.state.patch({
			open: true,
			generation: this.state.current.generation + 1,
			status: details.status,
			label: details.label,
			value: details.value
		});
		this.#close.arm();
		return true;
	}
};
//#endregion
export { StatusIndicatorCore };

//# sourceMappingURL=status-indicator-core.js.map