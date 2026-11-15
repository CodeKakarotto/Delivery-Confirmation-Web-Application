/**
 * Light/dark color theme. The theme is the `data-theme` attribute on <html> ("dark" or absent = light),
 * saved in localStorage. public/theme-init.js applies the saved value before the first paint.
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mf-theme';

export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: the choice still applies until the page is reloaded.
  }
}
