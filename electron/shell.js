import { getActiveRoute, useRouteChangesSubscriber } from '../router/index.js';

export const DEFAULT_TITLEBAR_HEIGHT_PX = 32;
const ELECTRON_SHELL_STYLE_ID = 'sw-electron-shell-styles';

/** True when running inside the Switch Electron shell (`window.switchApp.isElectron`). */
export function isElectronShell() {
  return typeof window !== 'undefined' && !!window.switchApp?.isElectron;
}

/** True when not in the Electron shell (standard browser / web build). */
export function isWebShell() {
  return !isElectronShell();
}

/** Electron window controls API exposed by the desktop host, if available. */
export function getWindowControls() {
  return typeof window !== 'undefined' ? window.switchApp?.windowControls ?? null : null;
}

function ensureElectronShellGlobalStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(ELECTRON_SHELL_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = ELECTRON_SHELL_STYLE_ID;
  style.textContent = `
    html.electron-shell {
      --electron-titlebar-h: ${DEFAULT_TITLEBAR_HEIGHT_PX}px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Applies document-level layout hooks used by the built-in title bar (CSS vars, host class).
 */
export function applyElectronShellLayout(heightPx = DEFAULT_TITLEBAR_HEIGHT_PX) {
  if (!isElectronShell()) return;
  ensureElectronShellGlobalStyles();
  document.documentElement.classList.add('electron-shell');
  document.documentElement.style.setProperty('--electron-titlebar-h', `${heightPx}px`);
}

/**
 * Resolves which shell title bar should be visible (`tabs` or `stack`).
 * Uses `activeLayout` from globalStates when route is omitted.
 */
export function getElectronTitleBarHost(route) {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    const activeLayout = globalStates.getState('activeLayout');
    if (activeLayout === 'tabs' || activeLayout === 'stack') return activeLayout;
  }
  const activeRoute = route ?? getActiveRoute?.() ?? '';
  if (!activeRoute) return 'stack';
  const defined = globalStates?.getState?.('definedRoutes') || [];
  const match = defined.find((r) => r.route === activeRoute);
  return match?.layout === 'tabs' ? 'tabs' : 'stack';
}

/** Shows the tabs-shell title bar on tab layout, stack-shell title bar on stack layout. */
export function syncElectronTitleBarHost(route) {
  if (!isElectronShell()) return;
  applyElectronShellLayout();
  const host = getElectronTitleBarHost(route);
  document.documentElement.dataset.electronTitlebar = host;
}

/**
 * Returns title bar markup for manual placement (optional; shells embed it by default).
 * @param {'stack'|'tabs'} host
 */
export function electronTitleBarHtml(host = 'stack') {
  if (!isElectronShell()) return '';
  const tag = getElectronTitleBarTag();
  return `<${tag} data-host="${host}"></${tag}>`;
}

/** Custom element tag for the title bar (`sw-electron-titlebar` by default). */
export function getElectronTitleBarTag() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    const tag = globalStates.getState('electronTitleBarTag');
    if (tag) return tag;
  }
  return 'sw-electron-titlebar';
}

/**
 * Subscribe to route / global state changes and keep title bar host visibility in sync.
 * @returns {() => void} unsubscribe
 */
export function installElectronTitleBarRouteSync() {
  if (!isElectronShell()) return () => {};
  syncElectronTitleBarHost();
  return useRouteChangesSubscriber(() => syncElectronTitleBarHost());
}
