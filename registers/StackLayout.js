import { SwitchComponent } from './SwitchComponent.js';
import { registerScreens, ensureComponentDefined } from '../registerScreens.js';
import { startApp } from './index.js';
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
   * Boot the whole app from the layout class. Initializes the theme,
   * self-registers the layout, tabs layout and all screens, and starts
   * the app — no startApp/initTheme/getAppLayout calls needed in user code.
   *
   * Usage in index.js:
   *   import { MyStackLayout } from './app/_layout.js';
   *   MyStackLayout.startApp();
   *
   * @param {Function|string} [registers] - optional registers hook (same as startApp's second arg)
   */
  static startApp(registers) {
    initTheme();
    return startApp(this.getAppLayout(), registers);
  }

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
