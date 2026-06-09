(function() {
  var topBar = document.querySelector('.top-bar');
  var toggle = document.getElementById('searchToggle');
  var back = document.getElementById('searchBack');
  var input = document.getElementById('searchInput');

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

  var dropdownTrigger = document.querySelector('.dropdown-trigger');
  var dropdownPanel = document.getElementById('userDropdown');

  if (dropdownTrigger && dropdownPanel) {
    dropdownTrigger.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdownPanel.classList.toggle('open');
    });

    document.addEventListener('click', function() {
      dropdownPanel.classList.remove('open');
    });

    dropdownPanel.addEventListener('click', function(e) {
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

  function handleFormSubmit(form, errorEl) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
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
        if (resp.ok) {
          location.reload();
        } else {
          errorEl.textContent = resp.error || 'Something went wrong';
        }
      })
      .catch(function() {
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
      var pass = signUpForm.querySelector('[name="password"]').value;
      var confirm = signUpForm.querySelector('[name="confirm_password"]').value;
      if (pass !== confirm) {
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
        if (resp.ok) {
          location.reload();
        } else {
          signUpError.textContent = resp.error || 'Something went wrong';
        }
      })
      .catch(function() {
        signUpError.textContent = 'Network error';
      });
    });
  }
})();
