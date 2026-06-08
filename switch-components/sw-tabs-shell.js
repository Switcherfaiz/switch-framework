export class TwTabsShell extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsub = null;
    this._lastTabTag = null;
    this._layoutEl = null;
  }

  connectedCallback() {
    this.render();
    this.syncTabComponent();

    if (globalStates?.subscribe) {
      this._unsub = globalStates.subscribe(() => this.syncTabComponent());
    }
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
    this._unsub = null;
  }

  getContentContainer() {
    const layoutEl = this.shadowRoot.querySelector('[data-tabs-layout="1"]');
    if (layoutEl?.getContentContainer) return layoutEl.getContentContainer();
    return null;
  }

  getCustomTabComp() {
    const layout = globalStates?.getState ? (globalStates.getState('tabsLayout') || {}) : {};
    const tagName = layout.name || layout.customTabComponent || layout.container;
    if (!tagName) return '';
    return `<${tagName}></${tagName}>`;
  }

  getTabTagName() {
    const layout = globalStates?.getState ? (globalStates.getState('tabsLayout') || {}) : {};
    return layout.name || layout.customTabComponent || layout.container || null;
  }

  syncTabComponent() {
    const tagName = this.getTabTagName();
    if (tagName === this._lastTabTag && this._layoutEl) return;

    this._lastTabTag = tagName;

    if (this._layoutEl) {
      this._layoutEl.remove();
      this._layoutEl = null;
    }

    if (!tagName) return;

    const el = document.createElement(tagName);
    el.setAttribute('data-tabs-layout', '1');
    this._layoutEl = el;
    this.shadowRoot.appendChild(el);
  }

  render() {
    if (this.shadowRoot.querySelector('style')) return;

    this.shadowRoot.innerHTML = `${this.styleSheet()}`;
  }

  styleSheet() {
    return `
      <style>
        :host{display:block;width:100%;height:100dvh;font-family:"Poppins",system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
        *{box-sizing:border-box;font-family:inherit}
      </style>
    `;
  }
}
