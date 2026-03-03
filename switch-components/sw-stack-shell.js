export class TwStackShell extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  getContentContainer() {
    return this.shadowRoot.getElementById('content');
  }

  setTitle(title = '') {
    const el = this.shadowRoot.querySelector('.title');
    if (el) el.textContent = title;
  }

  render() {
    this.shadowRoot.innerHTML = `
      ${this.styleSheet()}
      <div class="content" id="content"></div>
    `;
  }

  styleSheet() {
    return `
      <style>
        :host{position:fixed;top:0;left:0;right:0;bottom:0;display:block;width:100%;height:100dvh;overflow:hidden;font-family:"Poppins",system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
        *{box-sizing:border-box;font-family:inherit}
        .content{background:transparent;height:100%;overflow:auto;overflow-x:hidden}
      </style>
    `;
  }
}
