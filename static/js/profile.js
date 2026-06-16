(function () {
  var script = document.currentScript;
  var handle = script.dataset.handle;
  var activeTab = script.dataset.activeTab;
  console.log('[profile] init: handle=' + handle + ' activeTab=' + activeTab + ' DOM-ready=' + document.readyState);

  var loading = {videos: false, galleries: false};
  var offsets = {videos: 0, galleries: 0};
  var hasMore = {videos: true, galleries: true};
  var initialized = {videos: false, galleries: false};
  var LIMIT = 20;

  function videoHtml(item) {
    var thumb = item.thumbnail_url
      ? '<img src="' + item.thumbnail_url + '" alt="' + item.title + '" class="thumb-img">'
      : '<div class="thumb-placeholder" style="--hue: ' + item.hue + '">'
      + '<span class="thumb-icon">'
      + '<svg class="icon icon--lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'
      + '<path d="M72,39.88V216.12a8,8,0,0,0,12.15,6.69l144.08-88.12a7.82,7.82,0,0,0,0-13.38L84.15,33.19A8,8,0,0,0,72,39.88Z" fill="currentColor"/>'
      + '</svg></span></div>';
    return '<a href="/video/' + item.id + '" class="video-card"' + (item.preview_url ? ' data-preview="true"' : '') + '>'
      + '<div class="thumbnail">' + thumb
      + (item.preview_url ? '<video class="thumb-preview" src="' + item.preview_url + '" muted playsinline preload="none" loop' + (item.thumbnail_url ? ' poster="' + item.thumbnail_url + '"' : '') + '></video><div class="thumb-spinner"></div>' : '')
      + '<span class="duration">' + item.duration + '</span></div>'
      + '<div class="video-info"><div class="video-details">'
      + '<h3 class="video-title">' + item.title + '</h3>'
      + '<p class="video-meta"><span class="meta-left">' + item.time_ago + '</span><span class="meta-right">'
      // + '<svg class="meta-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="none"/><path d="M128,189.09l54.72,33.65a8.4,8.4,0,0,0,12.52-9.17l-14.88-62.79,48.7-42A8.46,8.46,0,0,0,224.27,94L160.36,88.8,135.74,29.2a8.36,8.36,0,0,0-15.48,0L95.64,88.8,31.73,94a8.46,8.46,0,0,0-4.79,14.83l48.7,42L60.76,213.57a8.4,8.4,0,0,0,12.52,9.17Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/></svg> ' + item.favourite_count + ' • '
      + item.views + '</span></p>'
      + '</div></div></a>';
  }

  function galleryHtml(item) {
    var thumb = item.thumbnail_url
      ? '<img src="' + item.thumbnail_url + '" alt="' + item.title + '" class="gallery-card-img" loading="lazy">'
      : '<div class="gallery-card-placeholder">'
      + '<svg class="icon icon--lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'
      + '<rect width="256" height="256" fill="none"/>'
      + '<rect x="72" y="40" width="144" height="144" rx="8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>'
      + '<circle cx="120" cy="88" r="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>'
      + '<path d="M184,184v24a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H72" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>'
      + '<path d="M96.69,184l77.65-77.66a8,8,0,0,1,11.32,0L216,136.69" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>'
      + '</svg></div>';
    return '<a href="/gallery/' + item.id + '" class="gallery-card">'
      + '<div class="gallery-card-thumb">' + thumb + '<span class="gallery-card-pictures">' + item.image_count + ' pictures</span></div>'
      + '<div class="gallery-card-info">'
      + '<div class="gallery-card-details">'
      + '<h3 class="gallery-card-title">' + item.title + '</h3>'
      + '<p class="gallery-card-meta"><span class="meta-left">' + item.time_ago + '</span><span class="meta-right">'
      // + '<svg class="meta-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="none"/><path d="M128,189.09l54.72,33.65a8.4,8.4,0,0,0,12.52-9.17l-14.88-62.79,48.7-42A8.46,8.46,0,0,0,224.27,94L160.36,88.8,135.74,29.2a8.36,8.36,0,0,0-15.48,0L95.64,88.8,31.73,94a8.46,8.46,0,0,0-4.79,14.83l48.7,42L60.76,213.57a8.4,8.4,0,0,0,12.52,9.17Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/></svg> ' + item.favourite_count + ' • '
      + item.views + '</span></p>'
      + '</div>'
      + '</div></a>';
  }

  function loadItems(type) {
    if (loading[type] || !hasMore[type]) {
      console.log('[profile] loadItems skipped: type=' + type + ' loading=' + loading[type] + ' hasMore=' + hasMore[type]);
      return;
    }
    loading[type] = true;
    console.log('[profile] loadItems start: type=' + type + ' offset=' + offsets[type] + ' tab-active=' + document.querySelector('.profile-tab.active')?.dataset?.tab + ' tab-hidden=' + document.getElementById('tab-' + type)?.classList.contains('hidden'));

    var url = '/api/profile/' + handle + '/' + type + '?limit=' + LIMIT + '&offset=' + offsets[type];
    var grid = document.getElementById(type + 'Grid');
    var loader = document.getElementById(type + 'Loader');
    var empty = document.getElementById(type + 'Empty');

    loader.textContent = 'Loading...';
    loader.style.display = '';

    fetch(url)
      .then(function (r) {return r.json();})
      .then(function (data) {
        console.log('[profile] fetch ok: type=' + type + ' offset=' + offsets[type] + ' items=' + data.items.length + ' has_more=' + data.has_more);
        if (data.items.length === 0 && offsets[type] === 0) {
          console.log('[profile] empty set, showing empty state');
          empty.style.display = '';
          loader.style.display = 'none';
          loading[type] = false;
          hasMore[type] = false;
          return;
        }

        var html = '';
        for (var i = 0; i < data.items.length; i++) {
          html += (type === 'videos' ? videoHtml : galleryHtml)(data.items[i]);
        }
        grid.insertAdjacentHTML('beforeend', html);

        if (type === 'videos') {
          var cards = grid.querySelectorAll('.video-card[data-preview="true"]');
          for (var i = 0; i < cards.length; i++) {
            (function (card) {
              var video = card.querySelector('.thumb-preview');
              var spinner = card.querySelector('.thumb-spinner');
              if (!video) return;

              card.addEventListener('mouseenter', function () {
                video.currentTime = 0;
                if (spinner) spinner.classList.add('active');
                video.play().catch(function () { });
              });

              card.addEventListener('mouseleave', function () {
                video.pause();
                video.currentTime = 0;
                if (spinner) spinner.classList.remove('active');
              });

              video.addEventListener('playing', function () {
                if (spinner) spinner.classList.remove('active');
              });
            })(cards[i]);
          }
        }

        offsets[type] += data.items.length;
        hasMore[type] = data.has_more;
        loading[type] = false;

        if (!hasMore[type]) {
          loader.style.display = 'none';
        } else {
          loader.textContent = 'Scroll for more...';
        }
      })
      .catch(function (err) {
        console.log('[profile] fetch error: type=' + type + ' err=' + err);
        loader.textContent = 'Failed to load.';
        loading[type] = false;
      });
  }

  var sentinel = document.createElement('div');
  sentinel.className = 'scroll-sentinel';

  var observer = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        var activeTabEl = document.querySelector('.profile-tab.active');
        console.log('[profile] sentinel intersected, active tab element:', activeTabEl);
        if (activeTabEl) loadItems(activeTabEl.dataset.tab);
      }
    }
  }, {rootMargin: '200px'});

  var tabs = document.querySelectorAll('.profile-tab');
  var contents = {};
  contents.videos = document.getElementById('tab-videos');
  contents.galleries = document.getElementById('tab-galleries');

  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () {
      var tab = this.dataset.tab;
      console.log('[profile] tab click: tab=' + tab + ' initialized=' + initialized[tab]);
      for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
      this.classList.add('active');
      for (var key in contents) {
        contents[key].classList.toggle('hidden', key !== tab);
      }

      if (!initialized[tab]) {
        initialized[tab] = true;
        contents[tab].appendChild(sentinel);
        loadItems(tab);
      }

      var url = new URL(window.location);
      url.searchParams.set('tab', tab);
      history.replaceState(null, '', url);

      setTimeout(function () {
        observer.disconnect();
        var active = document.querySelector('.profile-tab.active');
        if (active) {
          var c = contents[active.dataset.tab];
          if (c && c.contains(sentinel)) {
            observer.observe(sentinel);
          }
        }
      }, 50);
    });
  }

  // ensure the correct tab is active (fallback in case template conditions didn't match)
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].dataset.tab === activeTab);
  }
  for (var key in contents) {
    contents[key].classList.toggle('hidden', key !== activeTab);
  }

  // kick off initial tab on load
  console.log('[profile] initial kickoff: activeTab=' + activeTab + ' contents[tab]=' + !!contents[activeTab] + ' sentinel parent before=' + (sentinel.parentNode ? sentinel.parentNode.id : 'none') + ' tab-active-el=' + document.querySelector('.profile-tab.active')?.dataset?.tab + ' tab-hidden=' + document.getElementById('tab-' + activeTab)?.classList.contains('hidden'));
  initialized[activeTab] = true;
  contents[activeTab].appendChild(sentinel);
  observer.observe(sentinel);
  loadItems(activeTab);

  // ---- followers / following modal ----
  var relModal = document.getElementById('relModal');
  var relModalBody = document.getElementById('relModalBody');
  var relModalTitle = document.getElementById('relModalTitle');
  var relModalLoader = document.getElementById('relModalLoader');
  var relModalEmpty = document.getElementById('relModalEmpty');
  var relModalClose = document.getElementById('relModalClose');
  var relModalSentinel = document.createElement('div');
  relModalSentinel.className = 'scroll-sentinel';
  var relListType = '';
  var relOffset = 0;
  var relLoading = false;
  var relHasMore = true;
  var relObserver = null;

  function profileCardHtml(item) {
    var avatar = item.avatar_url
      ? '<img src="' + item.avatar_url + '" alt="" class="avatar-img">'
      : '';
    return '<a href="/@' + item.handle + '" class="rel-card">'
      + '<div class="rel-card-avatar avatar' + (item.avatar_url ? '' : ' avatar--empty') + '">' + avatar + '</div>'
      + '<div class="rel-card-info">'
      + '<div class="rel-card-name">' + item.display_name + '</div>'
      + '<div class="rel-card-handle">@' + item.handle + '</div>'
      + '<div class="rel-card-meta">' + item.follower_count + ' followers</div>'
      + '</div>'
      + '</a>';
  }

  function loadRelItems() {
    if (relLoading || !relHasMore) return;
    relLoading = true;

    var url = '/api/profile/' + handle + '/' + relListType + '?limit=20&offset=' + relOffset;
    relModalLoader.textContent = 'Loading...';
    relModalLoader.style.display = '';

    fetch(url)
      .then(function (r) {return r.json();})
      .then(function (data) {
        if (data.items.length === 0 && relOffset === 0) {
          relModalEmpty.style.display = '';
          relModalLoader.style.display = 'none';
          relLoading = false;
          relHasMore = false;
          return;
        }

        var html = '';
        for (var i = 0; i < data.items.length; i++) {
          html += profileCardHtml(data.items[i]);
        }
        relModalBody.insertAdjacentHTML('beforeend', html);

        relOffset += data.items.length;
        relHasMore = data.has_more;
        relLoading = false;

        if (!relHasMore) {
          relModalLoader.style.display = 'none';
        } else {
          relModalLoader.textContent = 'Scroll for more...';
        }
      })
      .catch(function () {
        relModalLoader.textContent = 'Failed to load.';
        relLoading = false;
      });
  }

  function openRelModal(listType) {
    relListType = listType;
    relOffset = 0;
    relLoading = false;
    relHasMore = true;

    relModalBody.querySelectorAll('.rel-card').forEach(function (el) {el.remove();});
    relModalEmpty.style.display = 'none';
    relModalLoader.style.display = '';
    relModalLoader.textContent = 'Loading...';

    relModalTitle.textContent = listType === 'followers' ? 'Followers' : 'Following';
    relModal.showModal();

    loadRelItems();

    if (relObserver) relObserver.disconnect();
    relObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          loadRelItems();
        }
      }
    }, {rootMargin: '200px'});
    relModalBody.appendChild(relModalSentinel);
    relObserver.observe(relModalSentinel);
  }

  var statBtns = document.querySelectorAll('.profile-stat-btn');
  console.log('[profile] stat buttons found:', statBtns.length);
  statBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      openRelModal(this.dataset.list);
    });
  });

  relModalClose.addEventListener('click', function () {
    relModal.close();
  });

  relModal.addEventListener('click', function (e) {
    if (e.target === relModal) {
      relModal.close();
    }
  });

  relModal.addEventListener('close', function () {
    if (relObserver) {
      relObserver.disconnect();
      relObserver = null;
    }
  });

  // ---- follow button mock ----
  var followBtn = document.getElementById('followBtn');
  if (followBtn) {
    var followIcon = document.getElementById('followIcon');
    followBtn.addEventListener('click', function () {
      if (this.disabled) return;
      var span = this.querySelector('span');
      var spinner = document.createElement('span');
      spinner.className = 'follow-spinner';
      var oldDisplay = span.style.display;
      var oldIconDisplay = followIcon.style.display;
      span.style.display = 'none';
      followIcon.style.display = 'none';
      this.insertBefore(spinner, span);
      this.disabled = true;
      setTimeout(function () {
        var isFollowing = span.textContent === 'Following';
        span.textContent = isFollowing ? 'Follow' : 'Following';
        followBtn.classList.toggle('following', !isFollowing);
        followIcon.style.display = isFollowing ? 'none' : '';
        followBtn.removeChild(spinner);
        span.style.display = oldDisplay;
        followBtn.disabled = false;
      }, 600);
    });
  }
})();
