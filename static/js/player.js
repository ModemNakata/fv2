import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import '@videojs/http-streaming';
import 'videojs-contrib-quality-menu';

export function initPlayer(elementId, sourceUrl, sourceType) {
  var player = videojs(elementId, {
    fluid: true,
    html5: {
      vhs: {
        overrideNative: true,
      },
      nativeAudioTracks: false,
      nativeVideoTracks: false,
    },
    sources: [{
      src: sourceUrl,
      type: sourceType || 'video/mp4',
    }],
  });

  player.qualityMenu();

  return player;
}
