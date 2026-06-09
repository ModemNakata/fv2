//#region src/dom/ui/popover/popup-group.d.ts
type PopupGroupCloseReason = 'group-open';
interface PopupGroupMember {
  close: (reason: PopupGroupCloseReason) => void;
}
interface PopupGroup {
  open: (member: PopupGroupMember) => void;
  close: (member: PopupGroupMember) => void;
}
declare function createPopupGroup(): PopupGroup;
//#endregion
export { PopupGroup, PopupGroupCloseReason, PopupGroupMember, createPopupGroup };
//# sourceMappingURL=popup-group.d.ts.map