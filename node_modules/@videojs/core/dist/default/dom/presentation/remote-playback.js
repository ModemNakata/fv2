import { isObject } from "@videojs/utils/predicate";
//#region src/dom/presentation/remote-playback.ts
function resolveRemote(media) {
	const target = media;
	if (isObject(target.remote) && "state" in target.remote && "prompt" in target.remote) return target.remote;
}
function isRemotePlaybackConnected(media) {
	return resolveRemote(media)?.state === "connected";
}
function isRemotePlaybackConnecting(media) {
	return resolveRemote(media)?.state === "connecting";
}
async function requestRemotePlayback(media) {
	const remote = resolveRemote(media);
	if (!remote) throw new DOMException("Remote playback not supported", "NotSupportedError");
	return remote.prompt();
}
//#endregion
export { isRemotePlaybackConnected, isRemotePlaybackConnecting, requestRemotePlayback };

//# sourceMappingURL=remote-playback.js.map