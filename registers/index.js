import { registerFramework } from '../index.js';

let _appStarted = false;

/** True once startApp has run (manually or via auto-boot). */
export function hasAppStarted() {
  return _appStarted;
}

export async function startApp(layout, registers) {
  _appStarted = true;
  registerFramework();

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    document.documentElement.dataset.theme = savedTheme;
  }

  const root = document.querySelector('sw-app-initial');
  if (root && layout) {
    root.initialize(layout);
  }

  try {
    if (typeof registers === 'function') {
      Promise.resolve(registers()).catch(() => null);
    } else if (typeof registers === 'string' && registers) {
      import(registers).catch(() => null);
    }
  } catch (_) {
    // ignore
  }

  return root;
}
