import { SwitchComponent } from '../registers/SwitchComponent.js';
import { ensureState, updateState, getState, subscribeState } from '../state-managers/index.js';
import { applyElectronShellLayout, setElectronTitleBarTag } from '../electron/shell.js';

const TITLEBAR_SCOPE = 'titlebar';

/**
 * ElectronTitleBar – desktop window chrome for Switch Framework Electron apps.
 *
 * Extend to customize. Base onMount binds window controls — subclasses should
 * not replace those handlers unless they call the instance methods
 * (minimize / toggleMaximize / close).
 */
export class ElectronTitleBar extends SwitchComponent {
  static tag = 'sw-electron-titlebar';
  static titlebarHeight = 32;
  static appTitle = '';

  static processStyleSheet(css) {
    return String(css).replace(
      new RegExp(`(?<![\\w.-])${TITLEBAR_SCOPE}(?=::|[\\s.#\\[,>+~])`, 'gi'),
      `.${TITLEBAR_SCOPE}`
    );
  }

  static registerStates() {
    const tag = this.tag || 'sw-electron-titlebar';
    this.windowStateKey = `${tag}-window-state`;
    this.visibleStateKey = `${tag}-visible`;
    this.minimizeActionKey = `${tag}-action-minimize`;
    this.maximizeActionKey = `${tag}-action-maximize`;
    this.restoreActionKey = `${tag}-action-restore`;
    this.closeActionKey = `${tag}-action-close`;
    this.toggleMaximizeActionKey = `${tag}-action-toggle-maximize`;
    ensureState(this.windowStateKey, 'normal');
    ensureState(this.visibleStateKey, true);
    ensureState(this.minimizeActionKey, 0);
    ensureState(this.maximizeActionKey, 0);
    ensureState(this.restoreActionKey, 0);
    ensureState(this.closeActionKey, 0);
    ensureState(this.toggleMaximizeActionKey, 0);
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
    this.constructor.registerStates?.();
    if (this.constructor.tag && this.constructor.tag !== 'sw-electron-titlebar') {
      setElectronTitleBarTag(this.constructor.tag);
    }
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

  stateKey(kind) {
    return this.constructor[kind] || '';
  }

  minimize() {
    this.getWindowControls()?.minimize?.();
    const key = this.stateKey('windowStateKey');
    if (key) updateState(key, 'minimized');
  }

  maximize() {
    this.getWindowControls()?.maximize?.();
    this.refreshWindowState();
  }

  restore() {
    const controls = this.getWindowControls();
    if (controls?.isMaximized) {
      Promise.resolve(controls.isMaximized()).then((max) => {
        if (max) controls.maximize?.();
        this.refreshWindowState();
      });
      return;
    }
    controls?.maximize?.();
    this.refreshWindowState();
  }

  toggleMaximize() {
    this.getWindowControls()?.maximize?.();
    this.refreshWindowState();
  }

  close() {
    this.getWindowControls()?.close?.();
  }

  async refreshWindowState() {
    const controls = this.getWindowControls();
    const key = this.stateKey('windowStateKey');
    let maximized = false;
    try {
      maximized = !!(await controls?.isMaximized?.());
    } catch (_) {}
    if (key) updateState(key, maximized ? 'maximized' : 'normal');
    await this.syncMaximizeIcon();
  }

  getWindowState() {
    const key = this.stateKey('windowStateKey');
    return key ? (getState(key) || 'normal') : 'normal';
  }

  setVisible(visible) {
    const key = this.stateKey('visibleStateKey');
    if (key) updateState(key, !!visible);
    this.hidden = !visible;
  }

  show() { this.setVisible(true); }
  hide() { this.setVisible(false); }
  getVisible() {
    const key = this.stateKey('visibleStateKey');
    return key ? getState(key) !== false : !this.hidden;
  }
  toggleVisible() { this.setVisible(!this.getVisible()); }

  render() {
    if (!this.isElectron()) return '';

    const title = this.constructor.appTitle || '';
    const maximized = this.getWindowState() === 'maximized';
    const maxIcon = maximized ? 'switch_icon_window_restore' : 'switch_icon_window_maximize';
    const maxLabel = maximized ? 'Restore' : 'Maximize';

    return `
      <header class="titlebar" role="banner" aria-label="Window">
        <div class="drag" aria-hidden="true">
          ${title ? `<span class="app-name">${title}</span>` : ''}
        </div>
        <div class="controls">
          <button type="button" class="ctrl" id="etb-minimize" aria-label="Minimize">
            <span class="switch_icon_window_minimize" aria-hidden="true"></span>
          </button>
          <button type="button" class="ctrl" id="etb-maximize" aria-label="${maxLabel}">
            <span class="${maxIcon}" aria-hidden="true"></span>
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
    if (!btn || !icon) return;
    let maximized = this.getWindowState() === 'maximized';
    if (controls?.isMaximized) {
      try { maximized = !!(await controls.isMaximized()); } catch (_) {}
    }
    btn.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
    icon.className = maximized ? 'switch_icon_window_restore' : 'switch_icon_window_maximize';
  }

  bindInteractionHandlers() {
    const controls = this.getWindowControls();
    if (!controls) return;

    this.listener('#etb-minimize', 'click', () => this.minimize());
    this.listener('#etb-maximize', 'click', () => this.toggleMaximize());
    this.listener('#etb-close', 'click', () => this.close());
    this.listener('.drag', 'dblclick', () => this.toggleMaximize());

    if (typeof controls.onMaximizedChanged === 'function') {
      this._maxUnsub = controls.onMaximizedChanged(() => this.refreshWindowState());
    }
    this.refreshWindowState();
  }

  bindActionStates() {
    const C = this.constructor;
    const watch = (key, fn) => {
      if (!key) return;
      try {
        const unsub = subscribeState(key, fn, { immediate: false });
        if (typeof unsub === 'function') this.addOnDestroy(unsub);
      } catch (_) {}
    };
    watch(C.minimizeActionKey, () => this.minimize());
    watch(C.maximizeActionKey, () => this.maximize());
    watch(C.restoreActionKey, () => this.restore());
    watch(C.closeActionKey, () => this.close());
    watch(C.toggleMaximizeActionKey, () => this.toggleMaximize());
    watch(C.visibleStateKey, (visible) => {
      this.hidden = visible === false;
    });
  }

  onMount() {
    if (!this.isElectron()) return;
    applyElectronShellLayout(this.constructor.titlebarHeight);
    this.bindInteractionHandlers();
    this.bindActionStates();
    if (this.getVisible() === false) this.hidden = true;
  }

  onDestroy() {
    if (typeof this._maxUnsub === 'function') this._maxUnsub();
    this._maxUnsub = null;
  }

  styleSheet() {
    const h = this.constructor.titlebarHeight ?? 32;
    return `
      <style>
        @import '/assets/icons/style.css';
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
        :host([hidden]) {
          display: none !important;
        }
        * { box-sizing: border-box; }
        .titlebar {
          display: flex;
          align-items: stretch;
          height: 100%;
          background: var(--page_background, var(--surface, #f5f5f5));
          border-bottom: 1px solid var(--border_color, rgba(0, 0, 0, 0.06));
          -webkit-app-region: drag;
          user-select: none;
        }
        .drag {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          padding-left: 14px;
        }
        .app-name {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: var(--sub_text, #8f8f8f);
          pointer-events: none;
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
          color: var(--main_text, #000);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .ctrl span {
          font-family: 'switch-icons' !important;
          font-size: 14px;
          line-height: 1;
          speak: never;
        }
        .ctrl span::before { font-size: 14px; }
        .ctrl:hover { background: var(--surface_2, rgba(0, 0, 0, 0.05)); }
        .ctrl.close:hover {
          background: var(--error, #e81123);
          color: #fff;
        }
      </style>
    `;
  }
}

export default ElectronTitleBar;
