import { getElectronTitleBarTag } from '../electron/shell.js';

export class TwAppShell extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.stackrender = '';
    this.stackstyleSheet = '';
    this._rootTag = '';
  }

  connectedCallback() {
    const stack = globalStates?.getState ? (globalStates.getState('stackLayout') || {}) : {};
    this.stackrender = stack.stackrender || '';
    this.stackstyleSheet = stack.stackstyleSheet || '';
    this._rootTag = stack.name || stack.tag || '';
    this.render();
    this._syncTitleBars('stack');
  }

  getRootLayoutElement() {
    return this.shadowRoot?.querySelector('[data-sw-root-layout]') ?? null;
  }

  getContentContainer() {
    const root = this.getRootLayoutElement();
    if (root?.getContentContainer) return root.getContentContainer();
    return this.shadowRoot?.getElementById('root-host') ?? null;
  }

  getPopupsContainer() {
    return this.shadowRoot.querySelector('.popups, [data-popups], #stack-contents');
  }

  _syncTitleBars(layoutType = 'stack') {
    const tabsBar = this.shadowRoot.querySelector('[data-host="tabs"]');
    const stackBar = this.shadowRoot.querySelector('[data-host="stack"]');
    if (tabsBar) tabsBar.hidden = layoutType !== 'tabs';
    if (stackBar) stackBar.hidden = layoutType !== 'stack';
  }

  setLayout(layoutType = 'stack') {
    this._syncTitleBars(layoutType);
  }

  render() {
    const titleBarTag = getElectronTitleBarTag();
    const rootTag = this._rootTag;

    this.shadowRoot.innerHTML = `
      ${this.styleSheet()}
      <${titleBarTag} data-host="tabs"></${titleBarTag}>
      <${titleBarTag} data-host="stack"></${titleBarTag}>
      <div id="root-host">${rootTag ? `<${rootTag} data-sw-root-layout></${rootTag}>` : ''}</div>
      <div class="stack-contents" id="stack-contents">${this.stackrender}</div>
    `;
  }

  styleSheet() {
    let userCss = String(this.stackstyleSheet || '');
    userCss = userCss.replace('<style>', '').replace('</style>', '').trim();
    return `
      <style>
        ${userCss}
        :host {
          display: block;
          width: 100%;
          height: 100%;
          min-height: 100dvh;
          font-family: "Poppins", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          -webkit-tap-highlight-color: transparent;
          tap-highlight-color: transparent;
        }
        * { box-sizing: border-box; font-family: inherit; -webkit-tap-highlight-color: transparent; tap-highlight-color: transparent; }
        [data-host="tabs"],
        [data-host="stack"] {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 10001;
        }
        #root-host {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 100dvh;
        }
        #root-host > * {
          display: block;
          width: 100%;
          height: 100%;
        }
        .stack-contents {
          position: fixed;
          inset: 0;
          z-index: 10000;
          pointer-events: none;
        }
        .stack-contents > * { pointer-events: none; }
      </style>
    `;
  }
}
