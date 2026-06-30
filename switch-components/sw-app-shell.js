import { getElectronTitleBarTag } from '../electron/shell.js';

export class TwAppShell extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._layoutInjected = false;
    this.stackrender;
    this.stackstyleSheet;
  }

  connectedCallback() {
    const { stackrender, stackstyleSheet } = globalStates.getState('stackLayout');
    this.stackrender = stackrender || '';
    this.stackstyleSheet = stackstyleSheet || '';
    this.render();
    this.setLayout('stack');
  }

  getContentContainer() {
    const activeLayout = globalStates?.getState ? globalStates.getState('activeLayout') : null;
    if (activeLayout === 'tabs') return this.getTabsContainer();
    return this.getStackContainer();
  }

  getStackContainer() {
    const stackShell = this.shadowRoot.querySelector('sw-stack-shell');
    if (!stackShell) return null;
    return stackShell.getContentContainer ? stackShell.getContentContainer() : null;
  }

  getTabsContainer() {
    const tabsShell = this.shadowRoot.querySelector('sw-tabs-shell');
    if (!tabsShell) return null;
    return tabsShell.getContentContainer ? tabsShell.getContentContainer() : null;
  }

  getPopupsContainer() {
    return this.shadowRoot.querySelector('#stack-contents');
  }

  _syncTitleBars(layoutType = 'stack') {
    const tabsBar = this.shadowRoot.querySelector('[data-host="tabs"]');
    const stackBar = this.shadowRoot.querySelector('[data-host="stack"]');
    if (tabsBar) tabsBar.hidden = layoutType !== 'tabs';
    if (stackBar) stackBar.hidden = layoutType !== 'stack';
  }

  setLayout(layoutType = 'stack') {
    const tabsShell = this.shadowRoot.querySelector('sw-tabs-shell');
    const stackShell = this.shadowRoot.querySelector('sw-stack-shell');

    if (tabsShell) tabsShell.style.display = layoutType === 'tabs' ? 'block' : 'none';
    if (stackShell) {
      stackShell.style.display = layoutType === 'tabs' ? 'none' : 'block';
      stackShell.style.pointerEvents = layoutType === 'tabs' ? 'none' : 'auto';
    }

    const layoutContent = this.shadowRoot.getElementById('layout-content');
    if (layoutContent) {
      layoutContent.style.display = layoutType === 'tabs' ? 'none' : 'block';
    }

    this._syncTitleBars(layoutType);
  }

  render() {
    const titleBarTag = getElectronTitleBarTag();

    this.shadowRoot.innerHTML = `
      ${this.styleSheet()}
      <${titleBarTag} data-host="tabs"></${titleBarTag}>
      <${titleBarTag} data-host="stack"></${titleBarTag}>
      <sw-tabs-shell style="display:none"></sw-tabs-shell>
      <sw-stack-shell></sw-stack-shell>
      <div class="stack-contents" id="stack-contents">${this.stackrender}</div>
    `;
  }

  styleSheet() {
    var userCss = this.stackstyleSheet.replace('<style>', '');
    userCss = userCss.replace('</style>', '');
    userCss = userCss.trim();
    return `
      <style>
        ${userCss}
        :host {
          display: block;
          width: 100%;
          min-height: 100dvh;
          font-family: "Poppins", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        * { box-sizing: border-box; font-family: inherit; }
        sw-electron-titlebar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 10001;
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
