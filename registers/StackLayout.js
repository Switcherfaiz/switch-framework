/**
 * StackLayout – base class for stack layouts.
 * Extends SwitchComponent. Provides getContentContainer() for framework injection.
 *
 * User defines static: tag, stackScreens, tabsLayout, splash, initialRoute, init
 * User overrides: render(), styleSheet(), getContentContainer()
 *
 * Used for custom stack layouts. Default stack uses built-in sw-stack-shell.
 */
import { SwitchComponent } from './SwitchComponent.js';
import { registerScreens } from '../registerScreens.js';

export class StackLayout extends SwitchComponent {
  static tag = 'sw-stack-layout';
  static stackScreens = [];
  static tabsLayout = null;
  static splash = 'sw-starter-splash';
  static initialRoute = 'index';

  getContentContainer() {
    return this.shadowRoot?.querySelector('.stack-content') ?? this.shadowRoot?.querySelector('#content') ?? null;
  }

  static getLayoutConfig() {
    return {
      name: this.tag || 'sw-stack-layout',
      layout: 'stack'
    };
  }

  /**
   * Build app layout object from static config. Use as: export default SwStackLayout.getAppLayout();
   */
  static getAppLayout(validate = true) {
    const tabsLayout = this.tabsLayout;
    const tabScreens = Array.isArray(tabsLayout?.screens) ? tabsLayout.screens : (tabsLayout?.getLayoutConfig?.()?.screens ?? []);
    const { screens, tabsLayout: resolvedTabsLayout } = registerScreens({
      stackScreens: this.stackScreens || [],
      tabsLayout: tabsLayout,
      tabScreens: tabScreens,
      validate
    });
    const initFn = this.init;
    return {
      splash: this.splash || 'sw-starter-splash',
      initialRoute: this.initialRoute || 'index',
      screens,
      async init(api) {
        const result = typeof initFn === 'function' ? await initFn.call(this, api) : {};
        if (resolvedTabsLayout && api?.globalStates) {
          api.globalStates.setState({ tabsLayout: resolvedTabsLayout });
        }
        return { ...result, screens, initialRoute: result?.initialRoute ?? this.initialRoute };
      }
    };
  }
}
