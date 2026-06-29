import { SwitchComponent } from '../registers/SwitchComponent.js';
import { applyElectronShellLayout } from '../electron/shell.js';

const TITLEBAR_SCOPE = 'titlebar';

/**
 * ElectronTitleBar – desktop window chrome for Switch Framework Electron apps.
 *
 * Embedded in `sw-tabs-shell` and `sw-stack-shell`. Extend to customize.
 *
 * Styling:
 * - Host (global CSS): `my-titlebar { }` — targets the custom element
 * - Extended styleSheet(): `titlebar .ctrl { }` or `titlebar::-webkit-scrollbar { }`
 *
 * Runtime (static / instance):
 * - ElectronTitleBar.isElectron(), ElectronTitleBar.isWeb()
 * - this.getWindowControls(), this.isElectron(), this.isWeb()
 */
export class ElectronTitleBar extends SwitchComponent {
  static tag = 'sw-electron-titlebar';
  static titlebarHeight = 32;

  /** Rewrites `titlebar::…` / `titlebar .class` to `.titlebar…` in extended styleSheets */
  static processStyleSheet(css) {
    return String(css).replace(
      new RegExp(`(?<![\\w.-])${TITLEBAR_SCOPE}(?=::|[\\s.#\\[,>+~])`, 'gi'),
      `.${TITLEBAR_SCOPE}`
    );
  }

  static isElectron() {
    return typeof window !== 'undefined' && !!window.switchApp?.isElectron;
  }

  static isWeb() {
    return !ElectronTitleBar.isElectron();
  }

  constructor() {
    super();
    this._maxUnsub = null;
    if (ElectronTitleBar.isElectron()) {
      this.setAttribute('data-electron', '1');
    }
  }

  isElectron() {
    return ElectronTitleBar.isElectron();
  }

  isWeb() {
    return ElectronTitleBar.isWeb();
  }

  getWindowControls() {
    return typeof window !== 'undefined' ? window.switchApp?.windowControls ?? null : null;
  }

  render() {
    if (!this.isElectron()) return '';

    return `
      <header class="titlebar" role="banner" aria-label="Window">
        <div class="drag" aria-hidden="true"></div>
        <div class="controls">
          <button type="button" class="ctrl" id="etb-minimize" aria-label="Minimize">
            <span class="switch_icon_window_minimize" aria-hidden="true"></span>
          </button>
          <button type="button" class="ctrl" id="etb-maximize" aria-label="Maximize">
            <span class="switch_icon_window_maximize" aria-hidden="true"></span>
          </button>
          <button type="button" class="ctrl close" id="etb-close" aria-label="Close">
            <span class="switch_icon_close" aria-hidden="true"></span>
          </button>
        </div>
      </header>
    `;
  }

  async syncMaximizeIcon() {
    const controls = this.getWindowControls();
    const btn = this.select('#etb-maximize');
    const icon = btn?.querySelector('span');
    if (!btn || !icon || !controls?.isMaximized) return;
    const maximized = await controls.isMaximized();
    btn.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
    icon.className = maximized ? 'switch_icon_window_restore' : 'switch_icon_window_maximize';
  }

  bindInteractionHandlers() {
    const controls = this.getWindowControls();
    if (!controls) return;

    this.listener('#etb-minimize', 'click', () => controls.minimize());
    this.listener('#etb-maximize', 'click', async () => {
      controls.maximize();
      await this.syncMaximizeIcon();
    });
    this.listener('#etb-close', 'click', () => controls.close());

    const drag = this.select('.drag');
    if (drag) {
      this.listener('.drag', 'dblclick', () => controls.maximize());
    }

    if (typeof controls.onMaximizedChanged === 'function') {
      this._maxUnsub = controls.onMaximizedChanged(() => this.syncMaximizeIcon());
    }
    this.syncMaximizeIcon();
  }

  onMount() {
    if (!this.isElectron()) return;
    applyElectronShellLayout(this.constructor.titlebarHeight);
    this.bindInteractionHandlers();
  }

  onDestroy() {
    if (typeof this._maxUnsub === 'function') this._maxUnsub();
    this._maxUnsub = null;
  }

  styleSheet() {
    const h = this.constructor.titlebarHeight ?? 32;
    return `
      <style>
        :host {
          display: block;
          width: 100%;
          height: var(--electron-titlebar-h, ${h}px);
          flex-shrink: 0;
          font-family: var(--font, 'Poppins', system-ui, sans-serif);
        }
        :host(:not([data-electron])) {
          display: none !important;
        }
        * { box-sizing: border-box; }
        .titlebar {
          display: flex;
          align-items: stretch;
          height: 100%;
          background: var(--page_background, var(--surface, #f5f5f5));
          border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
          -webkit-app-region: drag;
          user-select: none;
        }
        .drag {
          flex: 1;
          min-width: 0;
        }
        .controls {
          display: flex;
          align-items: stretch;
          flex-shrink: 0;
          -webkit-app-region: no-drag;
        }
        .ctrl {
          width: 46px;
          border: none;
          margin: 0;
          padding: 0;
          background: transparent;
          color: var(--text-primary, #000);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .ctrl span::before { font-size: 11px; }
        .ctrl:hover { background: var(--surface-2, rgba(0, 0, 0, 0.05)); }
        .ctrl.close:hover {
          background: var(--error, #e81123);
          color: #fff;
        }
      </style>
    `;
  }
}

export default ElectronTitleBar;
