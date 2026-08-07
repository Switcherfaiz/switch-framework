import { SwitchComponent } from './SwitchComponent.js';
import { registerScreens, ensureComponentDefined } from '../registerScreens.js';
import { startApp, hasAppStarted } from './index.js';
import { initTheme } from '../themes/index.js';

export class StackLayout extends SwitchComponent {
  static tag = 'sw-stack-layout';
  static stackScreens = [];
  static tabsLayout = null;
  static splash = 'sw-starter-splash';
  static initialRoute = 'index';

  // Instance versions (satisfy SwitchComponent/HTMLElement contract)
  render() { return ''; }
  styleSheet() { return ''; }

  // Static versions — called by app-shell directly on the class.
  // Override these as static in your subclass.
  static render() { return ''; }
  static styleSheet() { return ''; }
  

  getContentContainer() {
    
    return this.shadowRoot?.querySelector('#content') ?? null;
  }

  static getLayoutConfig() {
    return {
      name: this.tag || 'sw-stack-layout',
      layout: 'stack',
      stackrender:this.render(),
      stackstyleSheet:this.styleSheet()
    };
  }

  /**
   * Boot the whole app from the layout class. Called automatically by the
   * framework when index.html includes <sw-app-initial> and loads app/_layout.js.
   * Manual use is only needed for custom entry setups.
   *
   * @param {Function|string} [registers] - optional registers hook (same as startApp's second arg)
   */
  static startApp(registers) {
    initTheme();
    return startApp(this.getAppLayout(), registers);
  }

  /** Find the user's StackLayout subclass exported from a layout module. */
  static findLayoutClass(mod) {
    if (!mod || mod.default != null) return null;
    return Object.values(mod).find(
      (v) => typeof v === 'function' && v !== StackLayout && v.prototype instanceof StackLayout
    ) || null;
  }

  /** Resolve the layout module URL from index.html script tags. */
  static findLayoutModuleUrl() {
    if (typeof document === 'undefined') return '/app/_layout.js';
    const scripts = [...document.querySelectorAll('script[type="module"][src]')];
    const match = scripts.find((s) => /\/app\/_layout\.js(\?|#|$)/.test(s.src));
    return match?.src || '/app/_layout.js';
  }

  /** Auto-start the app when <sw-app-initial> is present and a StackLayout subclass exists. */
  static async autoBootFromPage() {
    if (hasAppStarted()) return;
    if (typeof document === 'undefined') return;
    if (!document.querySelector('sw-app-initial')) return;

    try {
      const mod = await import(StackLayout.findLayoutModuleUrl());
      if (hasAppStarted()) return;

      const Layout = StackLayout.findLayoutClass(mod);
      if (Layout) Layout.startApp();
    } catch (err) {
      console.error('[switch-framework] Failed to auto-start app:', err);
    }
  }

  static scheduleAutoBoot() {
    if (StackLayout._autoBootScheduled || typeof document === 'undefined') return;
    StackLayout._autoBootScheduled = true;

    const run = () => StackLayout.autoBootFromPage();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      queueMicrotask(run);
    }
  }

  static _autoBootScheduled = false;

  static getAppLayout(validate = true) {

    ensureComponentDefined(this);
    const tabsLayout = this.tabsLayout;
    const tabScreens = Array.isArray(tabsLayout?.screens)
      ? tabsLayout.screens
      : (tabsLayout?.getLayoutConfig?.()?.screens ?? []);


    const { screens, tabsLayout: resolvedTabsLayout } = registerScreens({
      stackScreens: this.stackScreens || [],
      tabsLayout,
      tabScreens,
      validate
    });

    const initFn = this.init;
    const stackLayoutConfig = this.getLayoutConfig
      ? this.getLayoutConfig()
      : { name: this.tag || 'sw-stack-layout', layout: 'stack' };

    return {
      //initialize and put configs globally for components to access them and resolving them
      splash: this.splash || 'sw-starter-splash',
      initialRoute: this.initialRoute || 'index',
      screens,
      async init(api) {
        const result = typeof initFn === 'function' ? await initFn.call(this, api) : {};
        if (resolvedTabsLayout && api?.globalStates) {
          api.globalStates.setState({ tabsLayout: resolvedTabsLayout });
        }
        if (api?.globalStates) {
          api.globalStates.setState({ stackLayout: stackLayoutConfig });
        }
        return { ...result, screens, initialRoute: result?.initialRoute ?? this.initialRoute };
      }
    };
  }
}

StackLayout.scheduleAutoBoot();
