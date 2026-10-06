const OVERLAY_TAG = 'sw-error-overlay';

const queue = [];
let selected = 0;
let open = true;
let listenersBound = false;
let idSeq = 0;

export function isOverlayEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage?.getItem('switchDevOverlay') === '0') return false;
  } catch {
    /* ignore */
  }
  if (window.__SWITCH_DEV__ === false) return false;
  return true;
}

function asError(err) {
  if (err instanceof Error) return err;
  if (typeof err === 'string' && err.trim() && err !== 'undefined') return new Error(err);
  if (err == null) return null;
  if (typeof err === 'object' && typeof err.message === 'string' && err.message.trim()) {
    const wrapped = new Error(err.message);
    if (err.stack) wrapped.stack = err.stack;
    return wrapped;
  }
  try {
    const text = JSON.stringify(err);
    if (!text || text === 'null' || text === 'undefined' || text === '{}') return null;
    return new Error(text);
  } catch {
    const text = String(err);
    if (!text || text === 'undefined' || text === 'null') return null;
    return new Error(text);
  }
}

function isOverlayFrame(file) {
  return /\/switch-framework\/overlay\//.test(String(file || ''));
}

function fileFromError(err) {
  const stack = String(err?.stack || '');
  const match = stack.match(/(\/[^:\s()]+\.(?:js|mjs|css)):(\d+)(?::(\d+))?/);
  if (!match) return '';
  return match[3] ? `${match[1]}:${match[2]}:${match[3]}` : `${match[1]}:${match[2]}`;
}

function dedupeKey(entry) {
  return `${entry.message}\0${entry.component}\0${entry.file}`;
}

const KINDS = {
  'Render failed': {
    title: 'This component failed to draw',
    cause: 'Switch was painting this element and something threw inside render(), styleSheet(), effects(), onMount(), or onUpdate().',
    fix: 'Open the file below, fix the throw, then save. The overlay updates when this component renders successfully.'
  },
  'Boot failed': {
    title: 'The app could not start',
    cause: 'Switch could not load app/_layout.js or run startApp(), so the root shell never came up.',
    fix: 'Check _layout.js for a syntax error, a missing import, or a layout rule that throws during boot.'
  },
  Convention: {
    title: 'A screen is registered incorrectly',
    cause: 'A layout convention failed while screens were being registered.',
    fix: 'Match the screen’s static layout to where you registered it, and make sure every tab route appears in a tab.match list.'
  },
  'Duplicate tag': {
    title: 'Two components share the same tag',
    cause: 'customElements.define() already used this static tag, so the second class was skipped. Routes can look stuck on the first class.',
    fix: 'Give this screen or component its own unique static tag (for example sw-settings-page).'
  },
  'Register failed': {
    title: 'A screen file could not be loaded',
    cause: 'startApp tried to import a registers module and the import failed.',
    fix: 'Confirm the file path exists and that any npm specifier is listed in switchFramework.imports.'
  },
  'Navigation failed': {
    title: 'Navigation could not finish',
    cause: 'navigate, replace, reset, wipeTo, goBack, or the history listener threw while changing screens.',
    fix: 'Check the route name, params, and the file in the stack. Expected missing routes still use +not-found and do not open this overlay.'
  },
  'Window error': {
    title: 'A script error stopped this page',
    cause: 'The browser reported an uncaught error (syntax, a throw, or a failed script).',
    fix: 'Use the file and stack below. If it is a missing npm package, add it to switchFramework.imports — do not allowlist first-party Switch packages.'
  },
  'Unhandled rejection': {
    title: 'A Promise failed with no catch',
    cause: 'An async function or import() rejected and nothing handled it.',
    fix: 'Add a .catch() or try/await, or fix the rejected import (often a bad specifier or a 404).'
  },
  'Asset failed to load': {
    title: 'A file failed to load',
    cause: 'The browser could not fetch a script, stylesheet, or module this page requested.',
    fix: 'Check the URL below. For npm packages, install the package and list it in switchFramework.imports.'
  },
  'Runtime error': {
    title: 'Something threw while the app was running',
    cause: 'An error reached the Switch overlay that was not a render, boot, or convention failure.',
    fix: 'Read the message and stack. The file line is the best starting point.'
  }
};

function refineExplanation(kind, message) {
  const text = String(message || '');
  if (/not owned by any tab/i.test(text)) {
    return {
      title: 'This tab route is not connected',
      cause: 'The screen is listed under TabLayout.screens, but no tab claims it in match.',
      fix: 'Open your TabLayout and add this screen name to that tab’s match array.'
    };
  }
  if (/registered in stackScreens/i.test(text)) {
    return {
      title: 'This screen is on the wrong layout',
      cause: 'The class says it is not a stack screen, but it was passed in stackScreens.',
      fix: 'Set static layout = \'stack\', or move the screen into TabLayout.screens.'
    };
  }
  if (/registered in TabLayout/i.test(text)) {
    return {
      title: 'This screen is on the wrong layout',
      cause: 'The class says it is not a tabs screen, but it was registered on TabLayout.',
      fix: 'Set static layout = \'tabs\', or move the screen into stackScreens.'
    };
  }
  if (/already defined/i.test(text)) {
    return KINDS['Duplicate tag'];
  }
  if (/is not defined/i.test(text)) {
    return {
      title: 'This name is not defined',
      cause: 'JavaScript used a variable or function that does not exist in this file’s scope.',
      fix: 'Open the file at the line below. Remove the stray token or spell the name the same way it is declared.'
    };
  }
  if (/Cannot read propert/i.test(text) || /undefined is not an object/i.test(text)) {
    return {
      title: 'This value was undefined',
      cause: 'The code read a property or called a method on undefined or null.',
      fix: 'Guard the value before using it, or fix the data that should have been there.'
    };
  }
  if (/Failed to fetch|error loading dynamically imported module|404/i.test(text)) {
    return {
      title: 'The browser could not load a module',
      cause: 'import() failed — the file is missing, the specifier is wrong, or the package is not on the import map.',
      fix: 'If this is an npm package, install it and add its name to switchFramework.imports. First-party names (switch-framework, switch-framework-icons) are mapped automatically.'
    };
  }
  if (/Unexpected token|SyntaxError/i.test(text) || kind === 'Window error' && /syntax/i.test(text)) {
    return {
      title: 'This JavaScript file has a syntax error',
      cause: 'The browser stopped parsing the file, so the module never ran.',
      fix: 'Open the file at the line in the stack and fix the syntax, then reload.'
    };
  }
  return KINDS[kind] || KINDS['Runtime error'];
}

function explain(err, meta, file) {
  const kind = meta.title || 'Runtime error';
  const message = err.message || String(err);
  const base = refineExplanation(kind, message);
  const whereParts = [
    meta.component && `component ${meta.component}`,
    meta.tag && `tag <${String(meta.tag).toLowerCase()}>`,
    meta.screenName && `screen ${meta.screenName}`,
    file && `file ${file}`
  ].filter(Boolean);
  return {
    kind,
    title: base.title,
    cause: base.cause,
    fix: base.fix,
    where: whereParts.join(' · ')
  };
}

function host() {
  if (typeof document === 'undefined') return null;
  let el = document.querySelector(OVERLAY_TAG);
  if (el) return el;
  if (!customElements.get(OVERLAY_TAG)) customElements.define(OVERLAY_TAG, SwErrorOverlay);
  el = document.createElement(OVERLAY_TAG);
  const mount = () => {
    if (!el.isConnected) document.body.appendChild(el);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
  return el;
}

function paint() {
  const el = host();
  if (el && typeof el.sync === 'function') el.sync({ queue, selected, open });
}

export function getErrorQueue() {
  return queue.slice();
}

export function clearErrors() {
  queue.length = 0;
  selected = 0;
  open = true;
  paint();
}

let reporting = false;

export function reportError(err, meta = {}) {
  if (!isOverlayEnabled()) {
    if (typeof console !== 'undefined') console.error('[switch-framework]', err);
    return;
  }

  const error = asError(err);
  if (!error) return;
  const file = meta.file || fileFromError(error);
  if (isOverlayFrame(file) && (!error.message || error.message === 'undefined')) return;
  if (reporting) return;
  reporting = true;
  try {
    publishError(error, meta, file, err);
  } finally {
    reporting = false;
  }
}

function publishError(error, meta, file, err) {
  const explained = explain(error, meta, file);
  const entry = {
    id: `sw-err-${++idSeq}`,
    kind: explained.kind,
    title: explained.title,
    cause: explained.cause,
    fix: explained.fix,
    where: explained.where,
    message: error.message || String(err),
    stack: error.stack || '',
    component: meta.component || '',
    tag: meta.tag || '',
    screenName: meta.screenName || '',
    file,
    time: Date.now()
  };

  const key = dedupeKey(entry);
  const existing = queue.findIndex((item) => dedupeKey(item) === key);
  if (existing >= 0) {
    queue[existing] = { ...queue[existing], ...entry, id: queue[existing].id };
    selected = existing;
  } else {
    queue.push(entry);
    selected = queue.length - 1;
  }
  open = true;
  if (typeof console !== 'undefined') console.error(`[switch-framework] ${entry.title}:`, error);
  paint();
}

export function installOverlay() {
  if (!isOverlayEnabled() || listenersBound) return;
  listenersBound = true;

  window.addEventListener('error', (event) => {
    if (event.defaultPrevented || reporting) return;
    const target = event.target;
    if (target && target.tagName === 'SW-ERROR-OVERLAY') return;

    const isElement = target && target !== window && target.nodeType === 1;
    if (isElement) {
      const tag = target.tagName;
      if (tag !== 'SCRIPT' && tag !== 'LINK') return;
      const src = target.src || target.href || '';
      if (!src || isOverlayFrame(src)) return;
      reportError(`Could not load ${src}`, {
        title: 'Asset failed to load',
        file: src.replace(/^https?:\/\/[^/]+/, '')
      });
      return;
    }

    const file = event.filename
      ? `${String(event.filename).replace(/^https?:\/\/[^/]+/, '')}:${event.lineno || 0}${event.colno ? `:${event.colno}` : ''}`
      : '';
    if (isOverlayFrame(file)) return;
    const err = event.error || event.message;
    if (err == null || err === '' || err === 'undefined') return;
    reportError(err, { title: 'Window error', file });
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (reporting) return;
    const reason = event.reason;
    if (reason == null || reason === '' || reason === 'undefined') return;
    const file = reason instanceof Error ? fileFromError(reason) : '';
    if (isOverlayFrame(file)) return;
    reportError(reason, { title: 'Unhandled rejection' });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open && queue.length) {
      open = false;
      paint();
    }
  });
}

class SwErrorOverlay extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._state = { queue: [], selected: 0, open: true };
  }

  connectedCallback() {
    this.sync(this._state);
  }

  sync(state) {
    this._state = state;
    if (!this.shadowRoot) return;
    const { queue: items, selected: index, open: isOpen } = state;
    if (!items.length) {
      this.shadowRoot.innerHTML = '';
      this.style.display = 'none';
      return;
    }
    this.style.display = 'block';
    const current = items[index] || items[0];
    const n = items.length;
    const label = n === 1 ? '1 error' : `${n} errors`;
    this.shadowRoot.innerHTML = `
      <style>${overlayCss()}</style>
      ${isOpen ? `
        <div class="layer">
          <div class="panel" role="alertdialog" aria-label="Switch Framework errors">
            <header class="top">
              <p class="count">${escapeHtml(label)}</p>
              <div class="bar">
                <button type="button" class="nav" data-act="prev" ${n < 2 ? 'disabled' : ''}>Prev</button>
                <button type="button" class="nav" data-act="next" ${n < 2 ? 'disabled' : ''}>Next</button>
                <button type="button" class="close" data-act="hide">Dismiss</button>
              </div>
            </header>
            <aside class="side">
              ${items.map((item, i) => `
                <button type="button" class="item" data-act="select" data-i="${i}" aria-current="${i === index ? 'true' : 'false'}">
                  <strong>${escapeHtml(item.title)}</strong>
                  <small>${escapeHtml(item.component || item.file || item.message)}</small>
                </button>
              `).join('')}
            </aside>
            <section class="main">
              <h1>${escapeHtml(current.title)}</h1>
              <p class="cause">${escapeHtml(current.cause)}</p>
              ${current.where ? `<p class="where"><span>Where</span>${escapeHtml(current.where)}</p>` : ''}
              <div class="fix">
                <span>What to do</span>
                <p>${escapeHtml(current.fix)}</p>
              </div>
              <p class="msg">${escapeHtml(current.message)}</p>
              ${current.stack ? `<details class="stack-wrap"${current.stack.length < 280 ? ' open' : ''}><summary>Stack trace</summary><pre class="stack">${escapeHtml(current.stack)}</pre></details>` : ''}
            </section>
          </div>
        </div>
      ` : `
        <button type="button" class="badge" data-act="show">${escapeHtml(label)}</button>
      `}
    `;
    this.shadowRoot.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        const act = btn.getAttribute('data-act');
        if (act === 'hide') open = false;
        if (act === 'show') open = true;
        if (act === 'prev') selected = (selected - 1 + queue.length) % queue.length;
        if (act === 'next') selected = (selected + 1) % queue.length;
        if (act === 'select') selected = Number(btn.getAttribute('data-i')) || 0;
        paint();
      });
    });
  }
}

function overlayCss() {
  return `
    :host { all: initial; }
    .layer {
      position: fixed; inset: 0; z-index: 2147483647;
      font-family: ui-sans-serif, system-ui, Segoe UI, sans-serif;
      color: #fde8e8;
      background: #14080a;
    }
    .panel {
      position: absolute; inset: 0;
      display: grid;
      grid-template-columns: minmax(220px, 300px) 1fr;
      grid-template-rows: auto 1fr;
      min-height: 100%;
      min-height: 100dvh;
    }
    .top {
      grid-column: 1 / -1;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 16px;
      padding-top: max(12px, env(safe-area-inset-top));
      border-bottom: 1px solid #5a1d24;
      background: #1b0b0e;
    }
    .count {
      margin: 0; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase;
      color: #ff8a8a; font-weight: 700;
    }
    .bar { display: flex; gap: 8px; flex-wrap: wrap; }
    button.nav, button.close {
      background: #4a1218; color: #ffe9e9; border: 1px solid #7a2a33;
      border-radius: 10px; padding: 10px 14px; min-height: 44px; cursor: pointer; font: 600 14px/1 inherit;
    }
    button.nav:disabled { opacity: 0.4; cursor: default; }
    button.close { background: #6b1a22; }
    .side {
      grid-row: 2;
      border-right: 1px solid #5a1d24;
      padding: 12px;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      background: #120709;
    }
    .item {
      width: 100%; text-align: left; border: 0; background: transparent;
      color: #ffd0d0; padding: 12px 12px; border-radius: 10px; cursor: pointer;
      display: block; margin-bottom: 6px; min-height: 44px;
    }
    .item[aria-current="true"] { background: #4a1218; }
    .item strong { display: block; font-size: 14px; font-weight: 650; }
    .item small { display: block; color: #c9898f; font-size: 12px; margin-top: 4px; word-break: break-word; }
    .main {
      grid-row: 2;
      padding: 24px 28px 40px;
      padding-bottom: max(40px, env(safe-area-inset-bottom));
      overflow: auto;
      -webkit-overflow-scrolling: touch;
    }
    h1 { font-size: clamp(22px, 4vw, 32px); margin: 0 0 12px; color: #ff5d5d; letter-spacing: -0.02em; line-height: 1.2; }
    .cause { font-size: 16px; line-height: 1.5; margin: 0 0 16px; color: #ffe9e9; }
    .where, .fix span, .stack-wrap summary {
      font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #ff8a8a; font-weight: 700;
    }
    .where { margin: 0 0 16px; line-height: 1.45; color: #e7b4b8; font-size: 14px; text-transform: none; letter-spacing: 0; font-weight: 500; word-break: break-word; }
    .where span { display: block; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #ff8a8a; font-weight: 700; margin-bottom: 4px; }
    .fix {
      background: #2a1014; border: 1px solid #7a2a33; border-radius: 12px;
      padding: 12px 14px; margin: 0 0 18px;
    }
    .fix p { margin: 6px 0 0; font-size: 15px; line-height: 1.5; color: #ffe9e9; }
    .msg {
      font-size: 15px; line-height: 1.5; margin: 0 0 16px; white-space: pre-wrap;
      color: #ffd0d0; word-break: break-word;
    }
    .stack-wrap { margin: 0; }
    .stack-wrap summary { cursor: pointer; padding: 8px 0; min-height: 44px; display: flex; align-items: center; }
    .stack {
      white-space: pre-wrap; color: #f3c6c6;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
      margin: 0; overflow: auto; max-height: 40vh; word-break: break-word;
    }
    .badge {
      position: fixed; right: max(16px, env(safe-area-inset-right));
      bottom: max(16px, env(safe-area-inset-bottom)); z-index: 2147483647;
      background: #b42318; color: #fff; border: 0; border-radius: 999px;
      padding: 12px 16px; min-height: 44px; font: 600 14px/1 ui-sans-serif, system-ui, sans-serif;
      cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    }
    @media (max-width: 720px) {
      .panel {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto 1fr;
      }
      .side {
        grid-row: 2;
        display: flex; flex-direction: row; gap: 8px;
        border-right: 0; border-bottom: 1px solid #5a1d24;
        max-height: none; overflow-x: auto; overflow-y: hidden;
        padding: 10px 12px;
        padding-left: max(12px, env(safe-area-inset-left));
        padding-right: max(12px, env(safe-area-inset-right));
      }
      .item {
        flex: 0 0 auto; width: min(78vw, 280px); margin: 0;
      }
      .main {
        grid-row: 3;
        padding: 16px 16px 32px;
        padding-left: max(16px, env(safe-area-inset-left));
        padding-right: max(16px, env(safe-area-inset-right));
      }
      h1 { font-size: 22px; }
      .cause, .fix p, .msg { font-size: 15px; }
      .top { flex-wrap: wrap; }
    }
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (typeof window !== 'undefined') installOverlay();
