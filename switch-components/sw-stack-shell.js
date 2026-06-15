export class TwStackShell extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsub = null;
    this._lastStackTag = null;
  }

  connectedCallback() {
    this.render();
    this.syncStackComponent();
    if (globalStates?.subscribe) {
      this._unsub = globalStates.subscribe(() => this.syncStackComponent());
    }
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
    this._unsub = null;
  }

  getContentContainer() {
    return this.shadowRoot.getElementById('content');
  }

  getStackTagName() {
    const layout = globalStates?.getState ? (globalStates.getState('stackLayout') || {}) : {};
    return layout.name || layout.customStackComponent || layout.container || null;
  }

  syncStackComponent() {
    const tagName = this.getStackTagName();
    if (tagName === this._lastStackTag) return;
    this._lastStackTag = tagName;
  }

  render() {
    if (this.shadowRoot.querySelector('style')) return;
    this.shadowRoot.innerHTML = `
      ${this.styleSheet()}
      <div id="content"></div>
    `;
  }

  styleSheet() {
    return `
      <style>
        :host {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          display: block; width: 100%; height: 100dvh; overflow: hidden;
          font-family: "Poppins", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        * { box-sizing: border-box; font-family: inherit; }
        #content {
          background: transparent; height: 100%;
          overflow: auto; overflow-x: hidden;
        }
      </style>
    `;
  }
}