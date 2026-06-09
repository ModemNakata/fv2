import { createPopover } from "../popover/popover.js";
//#region src/dom/ui/tooltip/tooltip.ts
/** Map popover reasons to tooltip reasons, filtering out click/outside-click. */
const REASON_MAP = {
	hover: "hover",
	focus: "focus",
	escape: "escape",
	blur: "blur",
	"imperative-action": "imperative-action"
};
function createTooltip(options) {
	const popoverOpts = {
		transition: options.transition,
		onOpenChange(open, details) {
			const reason = REASON_MAP[details.reason];
			if (!reason) return;
			const group = options.group?.();
			if (open) group?.notifyOpen();
			else group?.notifyClose();
			const tooltipDetails = details.event ? {
				reason,
				event: details.event
			} : { reason };
			options.onOpenChange(open, tooltipDetails);
		},
		closeOnEscape: () => true,
		closeOnOutsideClick: () => false,
		openOnHover: () => true,
		delay: () => {
			const group = options.group?.();
			if (group?.shouldSkipDelay()) return 0;
			return options.delay?.() ?? group?.delay ?? 600;
		},
		closeDelay: () => {
			const group = options.group?.();
			return options.closeDelay?.() ?? group?.closeDelay ?? 0;
		}
	};
	if (options.onOpenChangeComplete) popoverOpts.onOpenChangeComplete = options.onOpenChangeComplete;
	const popover = createPopover(popoverOpts);
	let isPointerDown = false;
	const { onClick: _, ...baseTriggerProps } = popover.triggerProps;
	const triggerProps = {
		...baseTriggerProps,
		onPointerDown() {
			isPointerDown = true;
		},
		onPointerEnter(event) {
			if (options.disabled?.()) return;
			if (event.pointerType === "touch") return;
			baseTriggerProps.onPointerEnter(event);
		},
		onFocusIn(event) {
			if (options.disabled?.()) return;
			if (isPointerDown) {
				isPointerDown = false;
				return;
			}
			baseTriggerProps.onFocusIn(event);
		}
	};
	const popupProps = {
		...popover.popupProps,
		onPointerEnter(event) {
			if (options.disableHoverablePopup?.()) return;
			popover.popupProps.onPointerEnter(event);
		}
	};
	return {
		...popover,
		triggerProps,
		popupProps,
		get triggerElement() {
			return popover.triggerElement;
		},
		open: () => popover.open("hover"),
		close: (reason = "hover") => popover.close(reason)
	};
}
//#endregion
export { createTooltip };

//# sourceMappingURL=tooltip.js.map