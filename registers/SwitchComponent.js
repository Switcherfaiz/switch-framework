/**
 * SwitchComponent – base class for screens and components.
 * Extends HTMLElement with shadow DOM, render lifecycle, and useEffect for state-driven updates.
 *
 * User defines static: name, path, title, layout, tag (optional)
 * User overrides: render(), styleSheet() (optional)
 * User calls: useEffect(callback, deps) in connectedCallback for reactive updates
 *
 * Reserved method names: constructor, connectedCallback, disconnectedCallback,
 * render, styleSheet, useEffect, _renderToShadow
 */
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
  }

  connectedCallback() {
    this._renderToShadow();
    if (typeof this.connected === 'function') {
      this.connected();
    }
  }

  disconnectedCallback() {
    this._effectUnsubs.forEach((fn) => { if (typeof fn === 'function') fn(); });
    this._effectUnsubs = [];
    if (typeof this.disconnected === 'function') {
      this.disconnected();
    }
  }

  /**
   * Subscribe to globalStates keys. When any change, run callback.
   * @param {() => void} callback - e.g. () => this.render()
   * @param {string[]} deps - globalStates keys to watch, e.g. ['activeRoute', 'routeParams']
   * @returns {() => void} unsubscribe
   */
  useEffect(callback, deps = []) {
    if (typeof globalStates === 'undefined' || !globalStates.subscribe) return () => {};
    const prev = deps.map((k) => globalStates.getState(k));
    const unsub = globalStates.subscribe(() => {
      const changed = deps.some((k, i) => {
        const cur = globalStates.getState(k);
        const different = !Object.is(prev[i], cur);
        prev[i] = cur;
        return different;
      });
      if (changed && typeof callback === 'function') callback();
    });
    this._effectUnsubs.push(unsub);
    return unsub;
  }

  _renderToShadow() {
    if (!this.shadowRoot) return;
    const html = typeof this.render === 'function' ? this.render() : '';
    const styles = typeof this.styleSheet === 'function' ? this.styleSheet() : '';
    const styleBlock = styles
      ? (String(styles).trim().startsWith('<style') ? styles : `<style>${styles}</style>`)
      : '';
    this.shadowRoot.innerHTML = styleBlock + (html || '');
  }

  /**
   * Re-render. Call this when state changes (or from useEffect).
   */
  render() {
    return '';
  }

  /**
   * Override to provide component styles. Return CSS string.
   */
  styleSheet() {
    return '';
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
