import { SwitchComponent } from '../registers/SwitchComponent.js';
import { applyElectronShellLayout } from '../electron/shell.js';
import {
  createState,
  getState,
  updateState,
  subscribeState,
  bindInstanceRefs
} from '../state-managers/index.js';

const TITLEBAR_SCOPE = 'titlebar';
const _titleBarStatesRegistered = new WeakSet();

/**
 * ElectronTitleBar – desktop window chrome for Switch Framework Electron apps.
 *
 * Base setup runs automatically (no super.onMount()). Extend, register with
 * registerComponents([YourTitleBar]), add static useState for state keys, wire
 * listeners in onMount with useRef(this), and read getState(key) in render().
 */
export class ElectronTitleBar extends SwitchComponent {
  static tag = 'sw-electron-titlebar';
  static titlebarHeight = 32;
  static windowStateKey = '';
  static visibleStateKey = '';
  static minimizeActionKey = '';
  static maximizeActionKey = '';
  static restoreActionKey = '';
  static closeActionKey = '';
  static toggleMaximizeActionKey = '';

  /** Creates default window + action states for a title bar class. */
  static registerStates(Cls) {
    if (!Cls?.tag || _titleBarStatesRegistered.has(Cls)) return;
    _titleBarStatesRegistered.add(Cls);

    const prefix = Cls.tag;
    Cls.windowStateKey = `${prefix}-window-state`;
    Cls.visibleStateKey = `${prefix}-visible`;
    Cls.minimizeActionKey = `${prefix}-action-minimize`;
    Cls.maximizeActionKey = `${prefix}-action-maximize`;
    Cls.restoreActionKey = `${prefix}-action-restore`;
    Cls.closeActionKey = `${prefix}-action-close`;
    Cls.toggleMaximizeActionKey = `${prefix}-action-toggle-maximize`;

    const ensure = (key, initial) => {
      try {
        createState(key, initial);
      } catch (_) {}
    };

    ensure(Cls.windowStateKey, 'normal');
    ensure(Cls.visibleStateKey, true);
    ensure(Cls.minimizeActionKey, 0);
    ensure(Cls.maximizeActionKey, 0);
    ensure(Cls.restoreActionKey, 0);
    ensure(Cls.closeActionKey, 0);
    ensure(Cls.toggleMaximizeActionKey, 0);
  }

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

  static {
    ElectronTitleBar.registerStates(ElectronTitleBar);
    ElectronTitleBar.useState('sw-electron-titlebar-window-state');
    ElectronTitleBar.useState('sw-electron-titlebar-visible');
  }

  constructor() {
    super();
    this._windowStateUnsub = null;
    this._titleBarBaseReady = false;
    if (ElectronTitleBar.isElectron()) {
      this.setAttribute('data-electron', '1');
    }
  }

  connectedCallback() {
    this.constructor.registerStates(this.constructor);
    this._ensureTitleBarBaseSetup();
    super.connectedCallback();
    bindInstanceRefs(this);
  }

  _ensureTitleBarBaseSetup() {
    if (this._titleBarBaseReady || !this.isElectron()) return;
    this._titleBarBaseReady = true;

    applyElectronShellLayout(this.constructor.titlebarHeight);
    this.refreshWindowState();
    this._subscribeWindowStateChanges();
    this._subscribeVisibility();
    this._watchActionStates();
  }

  getVisible() {
    const key = this.constructor.visibleStateKey;
    if (!key) return this.isElectron();
    try {
      return getState(key) !== false;
    } catch (_) {
      return true;
    }
  }

  show() {
    const key = this.constructor.visibleStateKey;
    if (key) updateState(key, true);
    this._syncVisibility();
  }

  hide() {
    const key = this.constructor.visibleStateKey;
    if (key) updateState(key, false);
    this._syncVisibility();
  }

  setVisible(visible) {
    const key = this.constructor.visibleStateKey;
    if (key) updateState(key, !!visible);
    this._syncVisibility();
  }

  toggleVisible() {
    this.setVisible(!this.getVisible());
  }

  _syncVisibility() {
    if (!this.isElectron()) {
      this.hidden = true;
      this.style.display = 'none';
      return;
    }
    const visible = this.getVisible();
    this.hidden = !visible;
    this.style.display = visible ? '' : 'none';
  }

  _subscribeVisibility() {
    const key = this.constructor.visibleStateKey;
    if (!key) return;
    try {
      const unsub = subscribeState(key, () => this._syncVisibility(), { immediate: false });
      this.addOnDestroy(unsub);
    } catch (_) {}
    this._syncVisibility();
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

  getWindowState() {
    const key = this.constructor.windowStateKey;
    if (!key) return 'normal';
    try {
      return getState(key) ?? 'normal';
    } catch (_) {
      return 'normal';
    }
  }

  async refreshWindowState() {
    const key = this.constructor.windowStateKey;
    if (!key) return;

    const controls = this.getWindowControls();
    if (!controls || typeof controls.isMaximized !== 'function') return;

    const maximized = await controls.isMaximized();
    updateState(key, maximized ? 'maximized' : 'normal');
  }

  async minimize() {
    this.getWindowControls()?.minimize?.();
    const key = this.constructor.windowStateKey;
    if (key) updateState(key, 'minimized');
  }

  async maximize() {
    this.getWindowControls()?.maximize?.();
    await this.refreshWindowState();
  }

  async restore() {
    this.getWindowControls()?.maximize?.();
    await this.refreshWindowState();
  }

  async toggleMaximize() {
    const state = this.getWindowState();
    if (state === 'maximized') await this.restore();
    else await this.maximize();
  }

  close() {
    this.getWindowControls()?.close?.();
  }

  _watchActionStates() {
    const C = this.constructor;
    const pairs = [
      [C.minimizeActionKey, () => this.minimize()],
      [C.maximizeActionKey, () => this.maximize()],
      [C.restoreActionKey, () => this.restore()],
      [C.closeActionKey, () => this.close()],
      [C.toggleMaximizeActionKey, () => this.toggleMaximize()]
    ];

    for (const [key, run] of pairs) {
      if (!key) continue;
      try {
        let prev = getState(key);
        const unsub = subscribeState(key, (val) => {
          if (Object.is(val, prev)) return;
          prev = val;
          run();
        }, { immediate: false });
        this.addOnDestroy(unsub);
      } catch (_) {}
    }
  }

  _subscribeWindowStateChanges() {
    const controls = this.getWindowControls();
    if (typeof controls?.onMaximizedChanged !== 'function') return;

    this._windowStateUnsub = controls.onMaximizedChanged(() => {
      this.refreshWindowState();
    });
    this.addOnDestroy(() => {
      if (typeof this._windowStateUnsub === 'function') this._windowStateUnsub();
      this._windowStateUnsub = null;
    });
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
        :host([hidden]) {
          display: none !important;
          height: 0 !important;
          min-height: 0 !important;
          overflow: hidden;
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
