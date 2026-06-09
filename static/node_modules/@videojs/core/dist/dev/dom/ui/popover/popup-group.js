//#region src/dom/ui/popover/popup-group.ts
function createPopupGroup() {
	let current = null;
	return {
		open(member) {
			if (current === member) return;
			current?.close("group-open");
			current = member;
		},
		close(member) {
			if (current === member) current = null;
		}
	};
}
//#endregion
export { createPopupGroup };

//# sourceMappingURL=popup-group.js.map