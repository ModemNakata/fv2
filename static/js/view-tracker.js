// View tracker — fire-and-forget view registration via sendBeacon.
// Loaded with `defer` in video.html and gallery.html.
// Reads window.__CONTENT_ID__ set by an inline script in the template.
(function () {
  var id = window.__CONTENT_ID__;
  if (!id) return;
  var url = '/api/content/' + id + '/view';
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, '');
  } else {
    // Fallback for older browsers
    fetch(url, { method: 'POST', keepalive: true }).catch(function () {});
  }
})();
