(function() {
  var topBar = document.querySelector('.top-bar');
  var toggle = document.getElementById('searchToggle');
  var back = document.getElementById('searchBack');
  var input = document.getElementById('searchInput');
  var searchForm = document.getElementById('searchForm');

  if (topBar && toggle && back && input) {
    toggle.addEventListener('click', function() {
      topBar.classList.add('search-open');
      input.focus();
    });

    back.addEventListener('click', function() {
      topBar.classList.remove('search-open');
      input.blur();
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        topBar.classList.remove('search-open');
        input.blur();
      }
    });
  }

  if (searchForm) {
    searchForm.addEventListener('submit', function(e) {
      var q = input.value.trim();
      if (!q) { e.preventDefault(); return; }
      var path = window.location.pathname;
      this.action = path.startsWith('/gallery') ? '/gallery' : '/';
    });
  }

  if (input) {
    var params = new URLSearchParams(window.location.search);
    var qVal = params.get('q');
    if (qVal) input.value = qVal;
  }

  var sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', function() {
      var url = new URL(window.location.href);
      var parts = this.value.split('-');
      url.searchParams.set('sort', parts[0]);
      url.searchParams.set('order', parts[1]);
      url.searchParams.delete('page');
      window.location.href = url.toString();
    });
  }

  function toggleSidebar(open) {
    if (!sidebar) return;
    var isOpen = open !== undefined ? open : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', isOpen);
    if (sidebarBackdrop) sidebarBackdrop.classList.toggle('open', isOpen);
    document.body.classList.toggle('sidebar-open', isOpen);
  }

  var menuBtn = document.querySelector('.menu-btn');
  var sidebar = document.getElementById('sidebar');
  var sidebarBackdrop = document.getElementById('sidebarBackdrop');

  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', function() {
      toggleSidebar();
    });

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener('click', function() {
        toggleSidebar(false);
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) {
        toggleSidebar(false);
      }
    });
  }

  var dropdownTriggers = document.querySelectorAll('.dropdown-trigger');
  var userDropdown = document.getElementById('userDropdown');
  var createDropdown = document.getElementById('createDropdown');

  dropdownTriggers.forEach(function(trigger) {
    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      var allPanels = document.querySelectorAll('.dropdown-panel');
      var panel = trigger.parentElement.querySelector('.dropdown-panel');
      allPanels.forEach(function(p) {
        if (p !== panel) p.classList.remove('open');
      });
      if (panel) panel.classList.toggle('open');
    });
  });

  document.addEventListener('click', function() {
    var allPanels = document.querySelectorAll('.dropdown-panel');
    allPanels.forEach(function(p) { p.classList.remove('open'); });
  });

  if (userDropdown) {
    userDropdown.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  if (createDropdown) {
    createDropdown.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  // ── Notifications ──────────────────────────────────────────────────────

  var notifDropdownPanel = document.getElementById('notifDropdownPanel');
  if (notifDropdownPanel) {
    notifDropdownPanel.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  function updateBadge() {
    fetch('/api/notifications/unread')
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        var badge = document.getElementById('notifBadge');
        if (badge) {
          if (resp.count > 0) {
            badge.hidden = false;
            badge.textContent = resp.count > 99 ? '99+' : resp.count;
          } else {
            badge.hidden = true;
          }
        }
      });
  }

  function loadRecentNotifications() {
    var list = document.getElementById('notifDropdownList');
    if (!list) return;
    fetch('/api/notifications/recent')
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        if (!resp.ok || resp.notifications.length === 0) {
          list.innerHTML = '<div class="notif-dropdown-empty">No notifications yet</div>';
          return;
        }
        list.innerHTML = '';
        resp.notifications.forEach(function(n) {
          var item = document.createElement('div');
          item.className = 'notif-item' + (n.is_read ? '' : ' notif-item--unread');
          item.dataset.id = n.id;

          var meta = n.metadata || {};
          var msg = '';
          if (n.type === 'purchase') {
            msg = 'Purchased <strong>' + escHtml(meta.content_title || 'your content') + '</strong>';
          } else {
            msg = n.type;
          }

          item.innerHTML =
            '<div class="notif-item-body">' +
              '<div class="notif-item-msg">' + msg + '</div>' +
              '<div class="notif-item-time">' + n.time_ago + '</div>' +
            '</div>';

          if (!n.is_read) {
            item.addEventListener('click', function(e) {
              e.stopPropagation();
              fetch('/api/notifications/' + n.id + '/read', { method: 'POST' })
                .then(function(r) { return r.json(); })
                .then(function(resp) {
                  if (resp.ok) {
                    item.classList.remove('notif-item--unread');
                    updateBadge();
                  }
                });
            });
          }

          list.appendChild(item);
        });
      });
  }

  var notifMarkAll = document.getElementById('notifMarkAllRead');
  if (notifMarkAll) {
    notifMarkAll.addEventListener('click', function(e) {
      e.stopPropagation();
      fetch('/api/notifications/read-all', { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(resp) {
          if (resp.ok) {
            document.querySelectorAll('#notifDropdownList .notif-item--unread').forEach(function(el) {
              el.classList.remove('notif-item--unread');
            });
            updateBadge();
          }
        });
    });
  }

  var notifBell = document.getElementById('notifBell');
  if (notifBell) {
    notifBell.addEventListener('click', function(e) {
      // Reload recent notifications each time the dropdown opens
      updateBadge();
      loadRecentNotifications();
    });
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Initial badge load
  updateBadge();

  var signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', function() {
      fetch('/auth/sign-out', { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(resp) {
          if (resp.ok) location.reload();
        });
    });
  }

  var dialog = document.getElementById('authDialog');
  var signInBtn = document.getElementById('signInBtn');
  var authPurchaseMsg = document.getElementById('authPurchaseMsg');

  if (dialog && signInBtn) {
    signInBtn.addEventListener('click', function() {
      if (window.__authForPurchase__ && authPurchaseMsg) {
        authPurchaseMsg.hidden = false;
      }
      dialog.showModal();
    });

    dialog.addEventListener('close', function() {
      if (authPurchaseMsg) authPurchaseMsg.hidden = true;
      window.__authForPurchase__ = false;
    });

    dialog.addEventListener('click', function(e) {
      if (e.target === dialog) {
        dialog.close();
      }
    });
  }

  var tabs = document.querySelectorAll('.auth-tab');
  var signInForm = document.getElementById('signInForm');
  var signUpForm = document.getElementById('signUpForm');

  if (tabs.length && signInForm && signUpForm) {
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        if (tab.dataset.tab === 'sign-in') {
          signInForm.classList.remove('hidden');
          signUpForm.classList.add('hidden');
        } else {
          signInForm.classList.add('hidden');
          signUpForm.classList.remove('hidden');
        }
      });
    });
  }

  function setLoading(btn, loading) {
    if (loading) {
      btn.disabled = true;
      btn.classList.add('btn--loading');
      btn.dataset.origText = btn.dataset.origText || btn.innerHTML;
      btn.innerHTML = '<span class="btn-spinner"></span> Processing...';
    } else {
      btn.disabled = false;
      btn.classList.remove('btn--loading');
      btn.innerHTML = btn.dataset.origText || btn.innerHTML;
    }
  }

  function handleFormSubmit(form, errorEl) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = form.querySelector('.auth-submit');
      setLoading(btn, true);
      errorEl.textContent = '';
      var data = new URLSearchParams(new FormData(form));
      var body = {};
      data.forEach(function(value, key) { body[key] = value; });
      var redirect = window.__authRedirect__;
      if (redirect) body.redirect = redirect;

      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        setLoading(btn, false);
        if (resp.ok) {
          window.__authRedirect__ = null;
          window.location.href = resp.redirect || window.location.href;
        } else {
          errorEl.textContent = resp.error || 'Something went wrong';
        }
      })
      .catch(function() {
        setLoading(btn, false);
        errorEl.textContent = 'Network error';
      });
    });
  }

  var signInError = document.getElementById('signInError');
  var signUpError = document.getElementById('signUpError');

  if (signInForm && signInError) handleFormSubmit(signInForm, signInError);

  var instantBtn = document.getElementById('instantRegisterBtn');
  if (instantBtn) {
    instantBtn.addEventListener('click', function() {
      setLoading(instantBtn, true);
      var url = '/auth/instant-register';
      var redirect = window.__authRedirect__;
      if (redirect) url += '?redirect=' + encodeURIComponent(redirect);
      fetch(url, { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(resp) {
          if (resp.ok) {
            window.__authRedirect__ = null;
            window.location.href = resp.redirect || window.location.href;
          } else {
            setLoading(instantBtn, false);
          }
        })
        .catch(function() {
          setLoading(instantBtn, false);
        });
    });
  }

  if (signUpForm && signUpError) {
    signUpForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = signUpForm.querySelector('.auth-submit');
      setLoading(btn, true);
      signUpError.textContent = '';
      var pass = signUpForm.querySelector('[name="password"]').value;
      var confirm = signUpForm.querySelector('[name="confirm_password"]').value;
      if (pass !== confirm) {
        setLoading(btn, false);
        signUpError.textContent = 'Passwords do not match';
        return;
      }
      var data = new URLSearchParams(new FormData(signUpForm));
      var body = {};
      data.forEach(function(value, key) { if (key !== 'confirm_password') body[key] = value; });
      var redirect = window.__authRedirect__;
      if (redirect) body.redirect = redirect;

      fetch(signUpForm.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        setLoading(btn, false);
        if (resp.ok) {
          window.__authRedirect__ = null;
          window.location.href = resp.redirect || window.location.href;
        } else {
          signUpError.textContent = resp.error || 'Something went wrong';
        }
      })
      .catch(function() {
        setLoading(btn, false);
        signUpError.textContent = 'Network error';
      });
    });
  }

  /* ── Cookie notice ─────────────────────────────────────────────────────── */

  var cookieNotice = document.getElementById('cookieNotice');
  var cookieClose = document.getElementById('cookieNoticeClose');

  if (cookieNotice && cookieClose) {
    if (localStorage.getItem('cookieNoticeDismissed') !== 'true') {
      cookieNotice.classList.remove('hidden');
      cookieClose.addEventListener('click', function() {
        cookieNotice.classList.add('hidden');
        localStorage.setItem('cookieNoticeDismissed', 'true');
      });
    }
  }

  /* ── Age verification overlay ───────────────────────────────────────────── */

  var ageOverlay = document.getElementById('ageOverlay');
  var ageEnter = document.getElementById('ageEnter');
  var ageExit = document.getElementById('ageExit');

  if (ageOverlay && ageEnter && ageExit) {
    if (localStorage.getItem('ageVerified') !== 'true') {
      ageOverlay.classList.remove('hidden');
      ageEnter.addEventListener('click', function() {
        ageOverlay.classList.add('hidden');
        localStorage.setItem('ageVerified', 'true');
      });
      ageExit.addEventListener('click', function() {
        window.location.href = 'about:blank';
      });
    }
  }

  /* ── Thumbnail & gallery image loading ── */
  document.querySelectorAll('.thumb-img, .gallery-card-img, .gallery-detail-img').forEach(function(img) {
    var parent = img.closest('.thumbnail') || img.closest('.gallery-card-thumb') || img.closest('.gallery-image-wrap');
    if (parent) {
      parent.classList.add('loading');
      parent.classList.remove('loaded');
    }

    function onImgDone() {
      img.classList.add('loaded');
      if (parent) {
        parent.classList.remove('loading');
        parent.classList.add('loaded');
      }
    }

    if (img.complete && img.naturalWidth > 0) {
      onImgDone();
    } else {
      img.addEventListener('load', onImgDone);
      img.addEventListener('error', onImgDone);
    }
  });
})();
