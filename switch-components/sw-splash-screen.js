export class TwSplashScreen extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['component'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    const componentTag = this.getAttribute('component');

    this.shadowRoot.innerHTML = `
      ${this.styleSheet()}
      <div class="wrap">
        ${componentTag ? `<${componentTag}></${componentTag}>` : `
          <div class="center">
            <div class="logo" aria-label="S">
              <div class="p">S</div>
            </div>
            <div class="bubbles" aria-hidden="true">
              <span class="b b1"></span>
              <span class="b b2"></span>
              <span class="b b3"></span>
            </div>
            <div class="sub">Switch Framework Splash</div>
            <div class="hint">Pass your own splash tag via <code>renderSplashscreen('your-tag')</code> inside <code>layout.init()</code>.</div>
          </div>
        `}
      </div>
    `;
  }

  styleSheet() {
    return `
      <style>
        :host{display:block;width:100%;height:100dvh;font-family:"Poppins",system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
        *{box-sizing:border-box;font-family:inherit}

        .wrap{width:100%;height:100dvh;display:flex;align-items:center;justify-content:center;padding:18px;background:#fff}
        .center{display:flex;flex-direction:column;align-items:center;gap:14px}

        .logo{height:86px;width:86px;border-radius:50%;background:#e60023;display:flex;align-items:center;justify-content:center;box-shadow:0 18px 40px rgba(230,0,35,0.25);animation:pop 1.1s infinite ease-in-out}
        .p{color:#fff;font-weight:1000;font-size:46px;transform:translateY(-1px)}

        .bubbles{display:flex;gap:8px;align-items:flex-end;height:14px}
        .b{display:inline-block;height:10px;width:10px;border-radius:50%;background:rgba(31,41,55,0.25)}
        .b1{animation:bounce 0.9s infinite ease-in-out}
        .b2{animation:bounce 0.9s infinite ease-in-out 0.15s}
        .b3{animation:bounce 0.9s infinite ease-in-out 0.3s}

        .sub{color:var(--sub_text);font-size:14px;font-weight:700;letter-spacing:0.2px}
        .hint{color:rgba(31,41,55,0.7);font-size:12px;font-weight:700;max-width:340px;text-align:center;line-height:1.4}
        .hint code{background:rgba(31,41,55,0.06);padding:2px 6px;border-radius:8px}

        @keyframes pop{
          0%,100%{transform:translateY(0) scale(1)}
          50%{transform:translateY(-10px) scale(1.05)}
        }

        @keyframes bounce{
          0%,100%{transform:translateY(0);opacity:0.45}
          50%{transform:translateY(-10px);opacity:0.9}
        }
      </style>
    `;
  }
}
