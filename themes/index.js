const STORAGE_KEY = 'theme';
const THEME_ATTR = 'data-theme';

function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return getSystemTheme();
}

function changeTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') return;
  if (typeof document === 'undefined') return;
  document.body.setAttribute(THEME_ATTR, theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {}
  document.dispatchEvent(new CustomEvent('theme:change', { detail: { theme } }));
}

function initTheme() {
  const theme = getTheme();
  if (typeof document !== 'undefined') {
    document.body.setAttribute(THEME_ATTR, theme);
  }
  return theme;
}

let _themeSubs = new Set();

function useThemesChangesSubscriber(callback) {
  if (typeof callback !== 'function') return () => {};
  const handler = (e) => callback(e?.detail?.theme ?? getTheme());
  _themeSubs.add(handler);
  document.addEventListener('theme:change', handler);
  callback(getTheme());
  return () => {
    document.removeEventListener('theme:change', handler);
    _themeSubs.delete(handler);
  };
}

export { getSystemTheme, getTheme, changeTheme, initTheme, useThemesChangesSubscriber };
