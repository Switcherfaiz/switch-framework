import { registerFramework } from '../index.js';
import { initTheme } from '../themes/index.js';

let _appStarted = false;

/** True once startApp has run (manually or via auto-boot). */
export function hasAppStarted() {
  return _appStarted;
}

export async function startApp(layout, registers) {
  _appStarted = true;
  registerFramework();

  initTheme();

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
