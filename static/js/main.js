(function() {
  var topBar = document.querySelector('.top-bar');
  var toggle = document.getElementById('searchToggle');
  var back = document.getElementById('searchBack');
  var input = document.getElementById('searchInput');

  if (!topBar || !toggle || !back || !input) return;

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
})();
