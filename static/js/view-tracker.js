// View tracker — fire-and-forget view registration via sendBeacon.
// Loaded with `defer` in video.html, gallery.html, and profile.html.
// Reads window.__CONTENT_ID__ (content views) or window.__PROFILE_USER_ID__ (profile views).
(function () {
  var id = window.__CONTENT_ID__;
  if (id) {
    var url = '/api/content/' + id + '/view';
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, '');
    } else {
      fetch(url, { method: 'POST', keepalive: true }).catch(function () {});
    }
    return;
  }

  var profileId = window.__PROFILE_USER_ID__;
  if (profileId) {
    var url = '/api/profile/' + profileId + '/view';
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, '');
    } else {
      fetch(url, { method: 'POST', keepalive: true }).catch(function () {});
    }
  }
})();
