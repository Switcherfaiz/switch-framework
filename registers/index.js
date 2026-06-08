import { registerFramework } from '../index.js';

export async function startApp(layout, registers) {
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
