export class TwAppShell extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
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
    if (typeof stackShell.render === 'function') stackShell.render();
    return stackShell?.getContentContainer ? stackShell.getContentContainer() : null;
  }

  getTabsContainer() {
    const tabsShell = this.shadowRoot.querySelector('sw-tabs-shell');
    if (!tabsShell) return null;
    if (typeof tabsShell.render === 'function') tabsShell.render();
    return tabsShell?.getContentContainer ? tabsShell.getContentContainer() : null;
  }

  setLayout(layoutType = 'stack') {
    const tabsShell = this.shadowRoot.querySelector('sw-tabs-shell');
    const stackShell = this.shadowRoot.querySelector('sw-stack-shell');

    if (tabsShell && typeof tabsShell.render === 'function') tabsShell.render();
    if (stackShell && typeof stackShell.render === 'function') stackShell.render();

    if (tabsShell) tabsShell.style.display = layoutType === 'tabs' ? 'block' : 'none';
    if (stackShell) stackShell.style.display = layoutType === 'tabs' ? 'none' : 'block';
  }

  render() {
    this.shadowRoot.innerHTML = `
      ${this.styleSheet()}
      <sw-tabs-shell style="display:none"></sw-tabs-shell>
      <sw-stack-shell></sw-stack-shell>
    `;
  }

  styleSheet() {
    return `
      <style>
        :host{display:block;width:100%;min-height:100dvh;font-family:"Poppins",system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
        *{box-sizing:border-box;font-family:inherit}
      </style>
    `;
  }
}
