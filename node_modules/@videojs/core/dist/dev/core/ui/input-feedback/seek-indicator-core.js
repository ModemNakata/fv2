import { IndicatorCloseController, getIndicatorCloseDelay } from "./indicator-lifecycle.js";
import { formatCurrentTime, getSeekDirection, isSeekIndicatorAction } from "./status.js";
import { createState } from "@videojs/store";
//#region src/core/ui/input-feedback/seek-indicator-core.ts
const INITIAL_STATE = {
	open: false,
	generation: 0,
	direction: null,
	count: 0,
	seekTotal: 0,
	value: null,
	currentTime: "0:00",
	transitionStarting: false,
	transitionEnding: false
};
var SeekIndicatorCore = class {
	state = createState({ ...INITIAL_STATE });
	#props = {};
	#originTime = null;
	#close = new IndicatorCloseController(() => {
		this.#originTime = null;
		this.state.patch({
			open: false,
			direction: null,
			count: 0,
			seekTotal: 0,
			value: null
		});
	}, () => getIndicatorCloseDelay(this.#props));
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
		if (!isSeekIndicatorAction(event.action)) return false;
		const current = this.state.current;
		const direction = getSeekDirection(event, snapshot);
		const rapidRepeat = current.open && event.action === "seekStep" && current.direction === direction;
		if (!rapidRepeat) this.#originTime = snapshot.currentTime ?? null;
		const value = this.#getEffectiveSeekValue(event, snapshot, rapidRepeat);
		const seekTotal = rapidRepeat ? current.seekTotal + Math.abs(value) : Math.abs(value);
		this.state.patch({
			open: true,
			generation: current.generation + 1,
			direction,
			count: rapidRepeat ? current.count + 1 : 1,
			seekTotal,
			value: event.action === "seekStep" && seekTotal > 0 ? `${seekTotal}s` : null,
			currentTime: formatCurrentTime(snapshot)
		});
		this.#close.arm();
		return true;
	}
	#getEffectiveSeekValue(event, snapshot, rapidRepeat) {
		if (event.action !== "seekStep" || event.value === void 0) return 0;
		if (!rapidRepeat || this.#originTime === null) return event.value;
		const originTime = this.#originTime;
		const duration = snapshot.duration ?? Infinity;
		const currentTotal = this.state.current.seekTotal;
		const step = Math.abs(event.value);
		return (event.value < 0 ? Math.max(0, originTime - currentTotal) : Math.max(0, duration - originTime - currentTotal)) >= step ? event.value : 0;
	}
};
//#endregion
export { SeekIndicatorCore };

//# sourceMappingURL=seek-indicator-core.js.map