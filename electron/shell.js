import { useRouteChangesSubscriber } from '../router/index.js';
import { getRegisteredTitleBarTag, getDefaultTitleBarTag } from './titleBarRegistry.js';

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
 * Applies document-level Electron shell layout (CSS vars, host class).
 */
export function syncElectronTitleBarHost(route) {
  if (!isElectronShell()) return;
  applyElectronShellLayout();
}

/**
 * Returns title bar markup for manual placement (optional; app shell embeds one by default).
 */
export function electronTitleBarHtml() {
  if (!isElectronShell()) return '';
  const tag = getElectronTitleBarTag();
  return `<${tag} id="sw-app-titlebar"></${tag}>`;
}

/** Custom element tag for the title bar (`sw-electron-titlebar` by default). */
export function getElectronTitleBarTag() {
  return getRegisteredTitleBarTag() || getDefaultTitleBarTag();
}

/**
 * Subscribe to route / global state changes and keep Electron shell layout in sync.
 * @returns {() => void} unsubscribe
 */
export function installElectronTitleBarRouteSync() {
  if (!isElectronShell()) return () => {};
  syncElectronTitleBarHost();
  return useRouteChangesSubscriber(() => syncElectronTitleBarHost());
}
