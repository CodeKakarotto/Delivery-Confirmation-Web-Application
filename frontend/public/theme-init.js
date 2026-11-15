// Applies the saved color theme before the app renders, so dark mode never flashes light first.
// A separate file (not inline) because the Content-Security-Policy only allows scripts from 'self'.
(function () {
  try {
    if (window.localStorage.getItem('mf-theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {
    // Storage unavailable (private mode, blocked): stay on the default light theme.
  }
})();
