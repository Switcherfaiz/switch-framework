import { subscribeState } from '../state-managers/index.js';
import { registerStaticState, getStatesForSymbol } from '../staticStateRegistry.js';
import { createRef, registerStaticRef } from '../state-managers/index.js';
import { adoptGlobalComponentSheet } from '../switch-components/globalStyles/index.js';
import { decodeData } from '../helpers/codecs/codec.js';

/**
 * SwitchComponent – base class for screens and components.
 * Extends HTMLElement with shadow DOM, render lifecycle, and useEffect for state-driven updates.
 *
 * User defines static: name, path, title, tag (optional)
 * Optional static layout = 'stack' | 'tabs' — if omitted, inferred from
 * stackScreens (stack) or TabLayout.screens (tabs).
 * User calls this.useState('counter') in static {} for full re-render on state change
 * User overrides: render(), styleSheet() (optional), onMount() (optional), onDestroy() (optional)
 * User calls: useEffect(callback, deps) for reactive updates or this.useEffect(...)
 * User calls: rerender() or renderToShadow() to re-render (not _renderToShadow)
 *
 * @deprecated connected, disconnected – use onMount, onDestroy instead
 */
let _currentComponent = null;

function depsEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, i) => Object.is(value, b[i]));
}

function subscribeDep(key, onChange) {
  try {
    return subscribeState(key, onChange, { immediate: false });
  } catch (_) {}

  if (typeof globalThis.globalStates?.subscribe === 'function') {
    let prev = globalThis.globalStates.getState(key);
    return globalThis.globalStates.subscribe(() => {
      const next = globalThis.globalStates.getState(key);
      if (Object.is(prev, next)) return;
      prev = next;
      onChange(next);
    });
  }

  return () => {};
}

export class SwitchComponent extends HTMLElement {
  static screenName = '';
  static path = '/';
  static title = '';
  static tag = '';
  static props = '';

  /** Rerender automatically when the encoded props (data attribute) change. */
  static observedAttributes = ['data'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._effectUnsubs = [];
    this._effectSlots = [];
    this._effectHookIndex = 0;
    this._effectsQueued = new Set();
    this._isRendering = false;
    this._stateUnsubs = [];
    this._destroyCallbacks = [];
    this._hasRendered = false;
    this._propsRaw = undefined;
    this._propsCache = null;
    // React-style local state slots (useState hook)
    this._localSlots = [];
    this._localStateIndex = 0;
    // Tracks which shared keys this instance has subscribed to (useShared)
    this._sharedSubscribedKeys = null;
    // Stores the rerender unsub per key from useShared, so onState() can cancel them
    this._sharedUnsubs = null;
    // Tracks onState subscriptions keyed by state-key (onState hook)
    this._onStateMap = null;
  }

  connectedCallback() {
    this._runRenderAndMount();
    this._setupStaticStates();
    if (typeof this.connected === 'function') {
      const prev = _currentComponent;
      _currentComponent = this;
      try { this.connected(); } finally { _currentComponent = prev; }
    }
  }

  /**
   * Reacts to encoded props changes: when the data attribute is replaced
   * after the first render, the component re-renders with the new props.
   * The attribute itself is never removed or cleared by the framework.
   * Fires only after the initial mount (guarded by _hasRendered) so the
   * upgrade-time attribute setting does not cause a double render.
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name !== 'data' || oldValue === newValue) return;
    if (!this._hasRendered) return;
    this._runRenderAndMount();
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
    this._teardownEffects();
    this._effectUnsubs.forEach((fn) => { if (typeof fn === 'function') fn(); });
    this._effectUnsubs = [];
    this._stateUnsubs.forEach((fn) => { if (typeof fn === 'function') fn(); });
    this._stateUnsubs = [];
    // Clean up new hooks
    if (this._onStateMap) { this._onStateMap.clear(); this._onStateMap = null; }
    this._sharedUnsubs = null;
    this._localSlots = [];
    this._localStateIndex = 0;
    this._sharedSubscribedKeys = null;
    this._listenerRegistry = null;
    this._delegatedEvents = null;
    if (this.shadowRoot?._switchDelegated) this.shadowRoot._switchDelegated.clear();
    if (typeof this.disconnected === 'function') {
      try { this.disconnected(); } catch (_) {}
    }
  }

  _runRenderAndMount() {
    if (!this.shadowRoot) return;
    this._isRendering = true;
    // Set _currentComponent BEFORE render() so hooks (useState, useShared, onState)
    // can read it during the render phase.
    const prev = _currentComponent;
    _currentComponent = this;
    this._localStateIndex = 0;
    const html = typeof this.render === 'function' ? this.render() : '';
    const styles = this._collectStyleSheets();
    const styleBlock = styles
      ? (String(styles).trim().startsWith('<style') ? styles : `<style>${styles}</style>`)
      : '';
    this.shadowRoot.innerHTML = styleBlock + (html || '');
    this._hasRendered = true;
    adoptGlobalComponentSheet(this.shadowRoot);
    // _currentComponent is already this; effects() and onMount() can also call hooks.
    this._effectHookIndex = 0;
    try {
      if (typeof this.effects === 'function') this.effects();
      if (typeof this.onMount === 'function') this.onMount();
    } finally {
      _currentComponent = prev;
      this._isRendering = false;
      this._flushQueuedEffects();
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
   * React-style effect. Call from effects() (or onMount).
   * [] runs once after mount. ['key'] runs on mount and when that state/router
   * value changes. Returning a function from the callback is cleanup.
   * useEffect(null, ['key']) re-renders when the key changes, with no callback.
   */
  useEffect(callback, deps = []) {
    if (!Array.isArray(deps)) deps = [];
    const index = this._effectHookIndex++;
    let slot = this._effectSlots[index];
    const sameDeps = slot && depsEqual(slot.deps, deps);

    if (!slot) {
      slot = { callback, deps: deps.slice(), cleanup: null, unsubs: [] };
      this._effectSlots[index] = slot;
      slot.unsubs = this._subscribeEffectDeps(index, deps);
      this._effectsQueued.add(index);
    } else {
      slot.callback = callback;
      if (!sameDeps) {
        slot.unsubs.forEach((fn) => { if (typeof fn === 'function') fn(); });
        slot.deps = deps.slice();
        slot.unsubs = this._subscribeEffectDeps(index, deps);
        this._effectsQueued.add(index);
      }
    }

    return () => this._teardownEffectSlot(index);
  }

  _subscribeEffectDeps(index, deps) {
    return deps
      .filter((key) => typeof key === 'string' && key.length > 0)
      .map((key) => subscribeDep(key, () => {
        this._effectsQueued.add(index);
        if (!this._isRendering) this._runRenderAndMount();
      }));
  }

  _flushQueuedEffects() {
    const queued = [...this._effectsQueued];
    this._effectsQueued.clear();
    for (const index of queued) {
      const slot = this._effectSlots[index];
      if (!slot) continue;
      if (typeof slot.cleanup === 'function') {
        try { slot.cleanup(); } catch (_) {}
        slot.cleanup = null;
      }
      if (typeof slot.callback !== 'function') continue;
      try {
        const result = slot.callback();
        slot.cleanup = typeof result === 'function' ? result : null;
      } catch (_) {}
    }
  }

  _teardownEffectSlot(index) {
    const slot = this._effectSlots[index];
    if (!slot) return;
    slot.unsubs.forEach((fn) => { if (typeof fn === 'function') fn(); });
    if (typeof slot.cleanup === 'function') {
      try { slot.cleanup(); } catch (_) {}
    }
    this._effectSlots[index] = null;
  }

  _teardownEffects() {
    this._effectSlots.forEach((_, index) => this._teardownEffectSlot(index));
    this._effectSlots = [];
    this._effectHookIndex = 0;
    this._effectsQueued.clear();
  }

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
   * Decode this component's props from its data attribute (set by the parent
   * with createProps). Read-only: the data attribute is never removed or
   * modified, so the DOM always shows the props each instance received.
   * Returns {} when no data attribute is set or the payload is malformed.
   * The decoded object is cached per attribute value, so calling this in
   * render(), onMount() and event handlers costs nothing extra.
   * @returns {object} decoded props
   */
  getProps() {
    const raw = this.getAttribute('data');
    if (raw !== this._propsRaw) {
      this._propsRaw = raw;
      this._propsCache = decodeData(raw);
    }
    return this._propsCache ?? {};
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
   * @param {'flatlist'} [kind='flatlist']
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
      tag
    };
    if (this.layout) config.layout = this.layout;
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
