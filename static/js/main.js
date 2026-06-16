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
    document.body.style.paddingRight = isOpen ? (window.innerWidth - document.documentElement.clientWidth) + 'px' : '';
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

  if (dialog && signInBtn) {
    signInBtn.addEventListener('click', function() {
      dialog.showModal();
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

      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        setLoading(btn, false);
        if (resp.ok) {
          location.reload();
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

      fetch(signUpForm.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        setLoading(btn, false);
        if (resp.ok) {
          location.reload();
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
})();
