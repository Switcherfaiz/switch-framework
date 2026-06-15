
export class TwAppShell extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._layoutInjected = false;
    this.stackrender;
    this.stackstyleSheet;
  }

  
  connectedCallback() {
    const {stackrender,stackstyleSheet}=globalStates.getState("stackLayout");
    this.stackrender=stackrender||"";
    this.stackstyleSheet=stackstyleSheet||"";
    // Listen for layout changes from stack-shell
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
    return this.shadowRoot.querySelector("#stack-contents");
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
  }

  render() {
    
    this.shadowRoot.innerHTML = `
      ${this.styleSheet()}
      <sw-tabs-shell style="display:none"></sw-tabs-shell>
      <sw-stack-shell></sw-stack-shell>
      <div class="stack-contents" id="stack-contents">${this.stackrender}</div>
    `;
  }

  styleSheet() {
    var userCss=this.stackstyleSheet.replace("<style>","");
    userCss=userCss.replace("</style>","");
    userCss=userCss.trim();
    return `
      <style>
        ${userCss}
        :host {
          display: block; width: 100%; min-height: 100dvh;
          font-family: "Poppins", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        * { box-sizing: border-box; font-family: inherit; }
        .stack-contents {
          position: fixed; inset: 0; z-index: 10000; pointer-events: none;
        }
        .stack-contents > * { pointer-events: none; }
      </style>
    `;
  }
}