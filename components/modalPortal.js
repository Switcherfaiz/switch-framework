const POPUPS_SELECTOR = '.popups, [data-popups]';

function appShellRoot() {
  return document.querySelector('sw-app-shell')?.shadowRoot || null;
}

function createPopups() {
  const el = document.createElement('div');
  el.className = 'popups';
  el.setAttribute('data-popups', '');
  el.style.cssText = 'position:fixed;inset:0;z-index:10000;pointer-events:none;';
  return el;
}

export function isInPopups(el) {
  let node = el;
  while (node) {
    if (node.id === 'stack-contents') return true;
    node = node.parentElement;
  }
  return false;
}

export function ensurePopupsHost() {
  const root = appShellRoot();
  const stack = root?.querySelector('#stack-contents');

  if (stack) {
    const nested = stack.querySelector(POPUPS_SELECTOR);
    if (nested) return nested;
    if (stack.matches?.(POPUPS_SELECTOR)) return stack;
    const popups = createPopups();
    stack.appendChild(popups);
    return popups;
  }

  const existing = root?.querySelector(POPUPS_SELECTOR) || document.querySelector(POPUPS_SELECTOR);
  if (existing) return existing;

  const host = createPopups();
  (root || document.body).appendChild(host);
  return host;
}

/** Move a Modal host into the framework `.popups` layer. */
export function adoptModal(el) {
  if (!el) return el;
  if (isInPopups(el)) return el;

  const host = ensurePopupsHost();
  if (!host || el.parentNode === host) return el;

  const existing = [...host.children].find((child) => child !== el && child.tagName === el.tagName);
  if (existing) return existing;

  host.appendChild(el);
  return el;
}

const backStack = [];
let ignoreNextPop = 0;

function topInterceptingModal() {
  for (let i = backStack.length - 1; i >= 0; i -= 1) {
    const modal = backStack[i];
    if (modal?._isVisible?.() && modal._interceptBack?.()) return modal;
  }
  return null;
}

function onHardwareBack(e) {
  const modal = topInterceptingModal();
  if (!modal) return;
  e?.preventDefault?.();
  modal.onRequestClose();
}

function syncBackListener() {
  const on = backStack.some((m) => m?._trapActive);
  if (on && !syncBackListener.bound) {
    document.addEventListener('backbutton', onHardwareBack);
    syncBackListener.bound = true;
  }
  if (!on && syncBackListener.bound) {
    document.removeEventListener('backbutton', onHardwareBack);
    syncBackListener.bound = false;
  }
}

/** Router calls this on popstate. True = dismiss modal, skip navigation. */
export function consumeModalBack() {
  if (ignoreNextPop > 0) {
    ignoreNextPop -= 1;
    return true;
  }
  const modal = topInterceptingModal();
  if (!modal) return false;
  const idx = backStack.lastIndexOf(modal);
  if (idx >= 0) backStack.splice(idx, 1);
  modal._trapActive = false;
  modal.onRequestClose();
  syncBackListener();
  return true;
}

export function armModalBack(modal) {
  if (!modal || modal._trapActive || !modal._interceptBack?.()) return;
  modal._trapActive = true;
  backStack.push(modal);
  try {
    history.pushState({ ...(history.state || {}), swModal: modal.tagName }, '', location.href);
  } catch (_) {}
  syncBackListener();
}

export function disarmModalBack(modal) {
  if (!modal?._trapActive) return;
  modal._trapActive = false;
  const idx = backStack.lastIndexOf(modal);
  if (idx >= 0) backStack.splice(idx, 1);
  ignoreNextPop += 1;
  try { history.back(); } catch (_) { ignoreNextPop -= 1; }
  syncBackListener();
}

/** For overlays that are not Modal subclasses — arm Back while `open`. */
export function syncOverlayBack(host, open, onClose) {
  if (!host) return;
  if (open) {
    host._isVisible = () => true;
    host._interceptBack = () => true;
    if (typeof onClose === 'function') host.onRequestClose = onClose;
    armModalBack(host);
    return;
  }
  disarmModalBack(host);
}

export function syncPopupsPointerEvents(host, visible) {
  const popups = host?.parentElement?.matches?.(POPUPS_SELECTOR)
    ? host.parentElement
    : ensurePopupsHost();
  if (!popups) return;
  const anyOpen = visible || [...popups.children].some((el) => el !== host && el.classList?.contains('is-open'));
  popups.style.pointerEvents = anyOpen ? 'auto' : 'none';
}
