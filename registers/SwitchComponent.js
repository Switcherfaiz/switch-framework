import { subscribeState, getState } from '../state-managers/index.js';
import { registerStaticState, getStatesForSymbol } from '../staticStateRegistry.js';
import { createRef, registerStaticRef } from '../state-managers/index.js';
import { adoptGlobalComponentSheet } from '../switch-components/globalStyles/index.js';

/**
 * SwitchComponent – base class for screens and components.
 * Extends HTMLElement with shadow DOM, render lifecycle, and useEffect for state-driven updates.
 *
 * User defines static: name, path, title, layout, tag (optional)
 * User calls this.useState('counter') in static {} for full re-render on state change
 * User overrides: render(), effects() (optional), styleSheet() (optional), onMount() (optional), onDestroy() (optional)
 * User calls useEffect(callback, deps) inside effects() — same as React hooks at the top of a function component
 * User calls: useEffect(callback, deps) for reactive updates or this.useEffect(...)
 * User calls: rerender() or renderToShadow() to re-render (not _renderToShadow)
 *
 * @deprecated connected, disconnected – use onMount, onDestroy instead
 */
let _currentComponent = null;

export class SwitchComponent extends HTMLElement {
  static screenName = '';
  static path = '/';
  static title = '';
  static layout = 'stack';
  static tag = '';
  static props = '';

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._effectUnsubs = [];
    this._effectStore = [];
    this._effectHookIndex = 0;
    this._effectDepUnsubs = new Map();
    this._stateUnsubs = [];
    this._destroyCallbacks = [];
    this._staticStatesReady = false;
    this._globalDepSnapshots = new Map();
  }

  connectedCallback() {
    this._setupStaticStates();
    this._runRenderAndMount();
    if (typeof this.connected === 'function') {
      const prev = _currentComponent;
      _currentComponent = this;
      try { this.connected(); } finally { _currentComponent = prev; }
    }
  }

  disconnectedCallback() {
    if (typeof this.onDestroy === 'function') {
      try {
        const result = this.onDestroy();
        if (Array.isArray(result)) result.forEach((fn) => { if (typeof fn === 'function') fn(); });
      } catch (_) {}
    }
    this._destroyCallbacks.forEach((fn) => { if (typeof fn === 'function') fn(); });
    this._destroyCallbacks = [];
    this._effectStore.forEach((entry) => {
      if (entry?.cleanup) {
        try { entry.cleanup(); } catch (_) {}
      }
    });
    this._effectStore = [];
    this._effectHookIndex = 0;
    this._effectDepUnsubs.forEach((fn) => { if (typeof fn === 'function') fn(); });
    this._effectDepUnsubs.clear();
    this._globalDepSnapshots.clear();
    this._staticStatesReady = false;
    this._effectUnsubs.forEach((fn) => { if (typeof fn === 'function') fn(); });
    this._effectUnsubs = [];
    this._stateUnsubs.forEach((fn) => { if (typeof fn === 'function') fn(); });
    this._stateUnsubs = [];
    this._listenerRegistry = null;
    this._delegatedEvents = null;
    if (this.shadowRoot?._switchDelegated) this.shadowRoot._switchDelegated.clear();
    if (typeof this.disconnected === 'function') {
      try { this.disconnected(); } catch (_) {}
    }
  }

  _runRenderAndMount() {
    if (!this.shadowRoot) return;
    const html = typeof this.render === 'function' ? this.render() : '';
    const styles = this._collectStyleSheets();
    const styleBlock = styles
      ? (String(styles).trim().startsWith('<style') ? styles : `<style>${styles}</style>`)
      : '';
    this.shadowRoot.innerHTML = styleBlock + (html || '');
    adoptGlobalComponentSheet(this.shadowRoot);
    this._runEffectPhase();
    const prev = _currentComponent;
    _currentComponent = this;
    try {
      if (typeof this.onMount === 'function') this.onMount();
    } finally {
      _currentComponent = prev;
    }
  }

  _runEffectPhase() {
    this._effectHookIndex = 0;
    const prev = _currentComponent;
    _currentComponent = this;
    try {
      if (typeof this.effects === 'function') this.effects();
    } finally {
      _currentComponent = prev;
    }
  }

  _shallowEqualDeps(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }

  _readDepValue(key) {
    try {
      return getState(key);
    } catch (_) {
      if (typeof globalStates !== 'undefined' && globalStates?.getState) {
        return globalStates.getState(key);
      }
      return undefined;
    }
  }

  _readDepValues(depKeys) {
    return depKeys.map((k) => this._readDepValue(k));
  }

  _ensureEffectDepListeners(depKeys) {
    for (const k of depKeys) {
      if (this._effectDepUnsubs.has(k)) continue;

      let unsub = null;
      try {
        unsub = subscribeState(k, () => this._runRenderAndMount(), { immediate: false });
      } catch (_) {}

      if (typeof unsub !== 'function' && typeof globalStates !== 'undefined' && globalStates?.subscribe) {
        let lastVal = this._readDepValue(k);
        this._globalDepSnapshots.set(k, lastVal);
        unsub = globalStates.subscribe(() => {
          const next = this._readDepValue(k);
          if (next !== this._globalDepSnapshots.get(k)) {
            this._globalDepSnapshots.set(k, next);
            this._runRenderAndMount();
          }
        });
      }

      if (typeof unsub === 'function') this._effectDepUnsubs.set(k, unsub);
    }
  }

  /**
   * Merge styleSheet() from the full inheritance chain (base → extended).
   * Extended classes only add their rules; no super.styleSheet() needed.
   */
  _collectStyleSheets() {
    const constructors = [];
    let ctor = this.constructor;

    while (ctor && ctor.prototype) {
      constructors.unshift(ctor);
      ctor = Object.getPrototypeOf(ctor);
    }

    const parts = [];
    const seen = new Set();

    for (const C of constructors) {
      const fn = C.prototype.styleSheet;
      if (typeof fn !== 'function' || fn === SwitchComponent.prototype.styleSheet) continue;
      if (seen.has(fn)) continue;
      seen.add(fn);
      const raw = fn.call(this);
      if (raw) parts.push(this._processStyleSheet(raw));
    }

    return parts.join('');
  }

  /**
   * Optional hook: static processStyleSheet(css) on a class rewrites selector aliases in its styles.
   */
  _processStyleSheet(css) {
    let out = String(css);
    const processors = [];
    let ctor = this.constructor;

    while (ctor && ctor.prototype) {
      if (typeof ctor.processStyleSheet === 'function') {
        processors.unshift(ctor.processStyleSheet);
      }
      ctor = Object.getPrototypeOf(ctor);
    }

    for (const fn of processors) {
      out = fn(out);
    }
    return out;
  }

  _setupStaticStates() {
    if (this._staticStatesReady) return;
    this._staticStatesReady = true;

    const keys = this.constructor.__staticStateKeys || [];
    const states = keys.flatMap((sym) => getStatesForSymbol(sym));
    states.forEach((identifier) => {
      try {
        const unsub = subscribeState(identifier, () => this._runRenderAndMount());
        if (typeof unsub === 'function') this._stateUnsubs.push(unsub);
      } catch (_) {}
    });
  }

  /**
   * Re-render the component (render + onMount). Use from useEffect callback when deps change.
   */
  rerender() {
    this._runRenderAndMount();
  }

  /** Alias for rerender(). Re-renders the component. */
  renderToShadow() {
    this._runRenderAndMount();
  }

  /** @deprecated Use rerender() or renderToShadow() instead. */
  _renderToShadow() {
    this._runRenderAndMount();
  }

  /**
   * React-style effect hook. Call from effects(), not onMount.
   * [] runs once on mount. [key-a, key-b] re-runs when those state values change.
   * Return a cleanup function from the callback to run before re-run or unmount.
   * Do not list a state in deps if the callback updates that same state — infinite loop.
   * @param {(() => (() => void) | void) | null | undefined} callback
   * @param {string[]} deps - State keys to watch
   * @returns {() => void} manual cleanup (optional)
   */
  useEffect(callback, deps = []) {
    if (!Array.isArray(deps)) return () => {};

    if (callback == null) {
      if (deps.length > 0) this._ensureEffectDepListeners(deps);
      return () => {};
    }

    if (typeof callback !== 'function') return () => {};

    const idx = this._effectHookIndex++;
    const prev = this._effectStore[idx];
    const depValues = this._readDepValues(deps);
    const isEmpty = deps.length === 0;

    if (isEmpty && prev?.ran) {
      return typeof prev.cleanup === 'function' ? prev.cleanup : (() => {});
    }

    const shouldRun = !prev || (isEmpty && !prev.ran) || (!isEmpty && !this._shallowEqualDeps(prev.depValues, depValues));

    if (!shouldRun) return () => {};

    if (prev?.cleanup) {
      try { prev.cleanup(); } catch (_) {}
    }

    let cleanup = null;
    try {
      const result = callback();
      cleanup = typeof result === 'function' ? result : null;
    } catch (_) {}

    this._effectStore[idx] = {
      depValues,
      cleanup,
      depKeys: [...deps],
      ran: true
    };

    if (!isEmpty) this._ensureEffectDepListeners(deps);

    return typeof cleanup === 'function' ? cleanup : (() => {});
  }

  /**
   * Override to register useEffect hooks (like React function component body).
   * You can call useEffect multiple times — each call is one effect, in order.
   * Runs after every render, before onMount.
   */
  effects() {}

  /**
   * Override to run after each render. Attach listeners here.
   */
  onMount() {}

  /**
   * Override to run when component is removed. Return array of cleanup functions or do cleanup directly.
   */
  onDestroy() {}

  /**
   * Register a cleanup function to run when component is destroyed.
   */
  addOnDestroy(fn) {
    if (typeof fn === 'function') this._destroyCallbacks.push(fn);
  }

  /**
   * Query selector scoped to this component's shadow root.
   * @param {string} selector - CSS selector
   * @returns {Element|null}
   */
  select(selector) {
    return this.shadowRoot?.querySelector(selector) ?? null;
  }

  /**
   * Query selector all scoped to this component's shadow root.
   * @param {string} selector - CSS selector
   * @returns {Element[]}
   */
  selectAll(selector) {
    return Array.from(this.shadowRoot?.querySelectorAll(selector) ?? []);
  }

  /**
   * Attach a delegated listener. Safe to call from onMount on every render;
   * handlers are replaced, not stacked. Scoped to this component's shadow root.
   * @param {string} selector - CSS selector (e.g. '#inc', '.btn', ':host')
   * @param {string} event - Event type (e.g. 'click', 'keydown')
   * @param {(e: Event) => void} callback - Handler
   */
  listener(selector, event, callback) {
    if (!this.shadowRoot || typeof callback !== 'function') return;
    this._listenerRegistry = this._listenerRegistry || {};
    const delegated = (this.shadowRoot._switchDelegated = this.shadowRoot._switchDelegated || new Set());

    if (!this._listenerRegistry[event]) this._listenerRegistry[event] = new Map();
    this._listenerRegistry[event].set(selector, callback);

    if (!delegated.has(event)) {
      delegated.add(event);
      const bound = (e) => {
        if (e._switchHandled) return;
        const reg = this._listenerRegistry?.[event];
        if (!reg) return;
        for (const [sel, handler] of reg) {
          const target = sel === ':host' || sel === '' ? this : e.target.closest(sel);
          if (target) {
            e._switchHandled = true;
            handler.call(this, e);
            break;
          }
        }
      };
      this.shadowRoot.addEventListener(event, bound);
    }
  }

  render() {
    return '';
  }

  styleSheet() {
    return '';
  }

  static useState(identifier) {
    const symbol = Symbol('static-state');
    registerStaticState(symbol, identifier, { pending: false });
    if (!this.__staticStateKeys) this.__staticStateKeys = [];
    this.__staticStateKeys.push(symbol);
  }

  /**
   * Create a static ref for imperative APIs (e.g. FlatList scroll methods).
   * @param {string} [propName='ref']
   * @param {'flatlist'|'titlebar'} [kind='flatlist']
   */
  static useRef(propName = 'ref', kind = 'flatlist') {
    return registerStaticRef(this, propName, createRef(kind));
  }

  static getScreenConfig() {
    const name = this.screenName || (this.tag ? this.tag.replace(/^sw-|-screen$/g, '') : '');
    const tag = this.tag || (name ? `sw-${name}-screen` : '');
    const config = {
      name,
      path: this.path || (name ? `/${name}` : '/'),
      title: this.title || name,
      tag,
      layout: this.layout || 'stack'
    };
    if (this.props) config.props = this.props;
    return config;
  }
}

export function getCurrentComponent() {
  return _currentComponent;
}

export function setCurrentComponent(comp) {
  const prev = _currentComponent;
  _currentComponent = comp;
  return prev;
}
