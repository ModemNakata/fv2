import { getTransitionFlags } from "../transition.js";
//#region src/core/ui/alert-dialog/alert-dialog-core.ts
var AlertDialogCore = class {
	static defaultProps = {
		open: false,
		defaultOpen: false
	};
	/** Accept props for API consistency. Props are consumed by platform layers. */
	setProps(_props) {}
	#input = null;
	#titleId = void 0;
	#descriptionId = void 0;
	setInput(input) {
		this.#input = input;
	}
	setTitleId(id) {
		this.#titleId = id;
	}
	setDescriptionId(id) {
		this.#descriptionId = id;
	}
	getState() {
		const input = this.#input;
		return {
			open: input.active,
			status: input.status,
			titleId: this.#titleId,
			descriptionId: this.#descriptionId,
			...getTransitionFlags(input.status)
		};
	}
	getAttrs(state) {
		return {
			role: "alertdialog",
			"aria-modal": "true",
			"aria-labelledby": state.titleId,
			"aria-describedby": state.descriptionId
		};
	}
};
//#endregion
export { AlertDialogCore };

//# sourceMappingURL=alert-dialog-core.js.map