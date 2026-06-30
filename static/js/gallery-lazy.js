// Lazy-load gallery images as user scrolls down.
// Reads window.__CONTENT_ID__, __TOTAL_IMAGES__, __INITIAL_IMAGES__ set in gallery.html.
(function () {
  var contentId = window.__CONTENT_ID__;
  var totalImages = window.__TOTAL_IMAGES__ || 0;
  var initialImages = window.__INITIAL_IMAGES__ || 0;

  console.log('[gallery-lazy] contentId=%s total=%d initial=%d', contentId, totalImages, initialImages);

  // If all images are already rendered, nothing to lazy-load
  if (totalImages <= initialImages) {
    console.log('[gallery-lazy] all images already rendered, nothing to load');
    document.getElementById('gallery-loaded').hidden = false;
    return;
  }

  var loadingEl = document.getElementById('gallery-loading');
  var loadedEl = document.getElementById('gallery-loaded');
  var imageContainer = document.querySelector('.gallery-images');
  var offset = initialImages;
  var limit = 20;
  var isLoading = false;
  var hasMore = true;

  // Build an image wrap block matching the server-rendered structure
  function createImageBlock(url, alt, isBlurred) {
    var wrap = document.createElement('div');
    wrap.className = 'gallery-image-wrap' + (isBlurred ? ' blurred' : '');

    var img = document.createElement('img');
    img.className = 'gallery-detail-img';
    img.src = url;
    img.alt = alt;
    img.loading = 'lazy';
    wrap.appendChild(img);

    // main.js hooks loading/loaded for initial images only, so do it here
    wrap.classList.add('loading');
    img.addEventListener('load', function () {
      wrap.classList.remove('loading');
      wrap.classList.add('loaded');
    });
    img.addEventListener('error', function () {
      wrap.classList.remove('loading');
      wrap.classList.add('loaded');
    });

    if (isBlurred) {
      var overlay = document.createElement('div');
      overlay.className = 'img-lock-overlay';
      overlay.setAttribute('data-action', 'unlock');
      overlay.innerHTML =
        '<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">' +
        '<rect width="256" height="256" fill="none"/>' +
        '<rect x="40" y="90" width="176" height="128" rx="8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>' +
        '<circle cx="128" cy="152" r="12" fill="none"/>' +
        '<path d="M88,88V56a40,40,0,0,1,80,0V88" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>' +
        '</svg>';
      wrap.appendChild(overlay);
    }

    return wrap;
  }

  function loadMore() {
    if (isLoading || !hasMore) return;
    isLoading = true;
    loadingEl.hidden = false;

    var url = '/api/gallery/' + contentId + '/images?offset=' + offset + '&limit=' + limit;
    console.log('[gallery-lazy] fetching offset=%d limit=%d', offset, limit);

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        console.log('[gallery-lazy] got %d images, has_more=%s', data.images.length, data.has_more);

        data.images.forEach(function (img) {
          imageContainer.appendChild(createImageBlock(img.url, img.alt, img.is_blurred));
        });

        offset += data.images.length;
        hasMore = data.has_more;
        isLoading = false;
        loadingEl.hidden = true;

        if (!hasMore) {
          console.log('[gallery-lazy] all %d images loaded', totalImages);
          loadedEl.hidden = false;
        }
      })
      .catch(function (err) {
        console.error('[gallery-lazy] fetch error:', err);
        isLoading = false;
        loadingEl.hidden = true;
      });
  }

  // Use IntersectionObserver to trigger loading when sentinel comes into view
  var sentinel = document.createElement('div');
  sentinel.className = 'gallery-sentinel';
  imageContainer.parentNode.insertBefore(sentinel, imageContainer.nextSibling);

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        console.log('[gallery-lazy] sentinel visible, triggering load');
        loadMore();
      }
    });
  }, { rootMargin: '200px' });

  observer.observe(sentinel);

  console.log('[gallery-lazy] observer active, waiting for scroll');
})();
