import { getTransitionFlags } from "../transition.js";
import { defaults } from "@videojs/utils/object";
//#region src/core/ui/tooltip/tooltip-core.ts
var TooltipCore = class TooltipCore {
	static defaultProps = {
		side: "top",
		align: "center",
		open: false,
		defaultOpen: false,
		delay: 600,
		closeDelay: 0,
		disableHoverablePopup: true,
		disabled: false
	};
	#props = { ...TooltipCore.defaultProps };
	constructor(props) {
		if (props) this.setProps(props);
	}
	setProps(props) {
		this.#props = defaults(props, TooltipCore.defaultProps);
	}
	#input = null;
	setInput(input) {
		this.#input = input;
	}
	getState() {
		const input = this.#input;
		return {
			open: input.active,
			status: input.status,
			side: this.#props.side,
			align: this.#props.align,
			...getTransitionFlags(input.status)
		};
	}
	getPopupAttrs(_state) {
		return {
			popover: "manual",
			role: "presentation"
		};
	}
};
//#endregion
export { TooltipCore };

//# sourceMappingURL=tooltip-core.js.map