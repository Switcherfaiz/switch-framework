import { LayoutNavigator } from './LayoutNavigator.js';
import { ensureComponentDefined, assertExpoConventions } from '../registerScreens.js';
import { flattenLayoutTree, buildLayoutIndex, getLayoutChildren } from './layoutTree.js';
import { startApp, hasAppStarted } from './index.js';
import { initTheme } from '../themes/index.js';

export class StackLayout extends LayoutNavigator {
  static tag = 'sw-stack-layout';
  static screens = [];
  static stackScreens = [];
  static tabsLayout = null;
  static splash = 'sw-starter-splash';
  static initialScreen = '';
  static initialRoute = 'index';

  static render() { return ''; }
  static styleSheet() { return ''; }

  static getLayoutConfig() {
    return {
      name: this.tag || 'sw-stack-layout',
      screenName: this.screenName || '',
      layout: 'stack',
      initialScreen: this.initialScreen || this.initialRoute || '',
      stackrender: this.render(),
      stackstyleSheet: this.styleSheet()
    };
  }

  static startApp(registers) {
    initTheme();
    return startApp(this.getAppLayout(), registers);
  }

  static findLayoutClass(mod) {
    if (!mod || mod.default != null) return null;
    const values = Object.values(mod).filter((v) => typeof v === 'function');
    const root = values.find((v) => v?.isRootLayout && v.prototype instanceof StackLayout);
    if (root) return root;
    return values.find((v) => v !== StackLayout && !v.isRootLayout && v.prototype instanceof StackLayout) || null;
  }

  static findLayoutModuleUrl() {
    if (typeof document === 'undefined') return '/app/_layout.js';
    const scripts = [...document.querySelectorAll('script[type="module"][src]')];
    const match = scripts.find((s) => /\/app\/_layout\.js(\?|#|$)/.test(s.src));
    return match?.src || '/app/_layout.js';
  }

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
    const tree = flattenLayoutTree(this);
    const layoutIndex = buildLayoutIndex(tree.layouts);
    const screens = tree.leaves;
    const tabsNode = tree.layouts.find((n) => n.kind === 'tabs');
    const resolvedTabsLayout = tabsNode?.Cls
      ? {
          ...tabsNode.Cls.getLayoutConfig(),
          name: tabsNode.tag,
          screens: getLayoutChildren(tabsNode.Cls)
        }
      : null;

    if (validate) {
      assertExpoConventions({
        tabsLayout: resolvedTabsLayout,
        stackScreens: screens.filter((s) => s.layout !== 'tabs'),
        tabScreens: screens.filter((s) => s.layout === 'tabs')
      });
    }

    const initFn = this.init;
    const stackLayoutConfig = this.getLayoutConfig();
    const initialScreen = this.initialScreen || this.initialRoute || 'index';

    return {
      splash: this.splash || 'sw-starter-splash',
      initialRoute: initialScreen,
      screens,
      layoutIndex,
      layoutNodes: tree.layouts,
      async init(api) {
        const result = typeof initFn === 'function' ? await initFn.call(this, api) : {};
        if (api?.globalStates) {
          if (resolvedTabsLayout) api.globalStates.setState({ tabsLayout: resolvedTabsLayout });
          api.globalStates.setState({
            stackLayout: stackLayoutConfig,
            layoutIndex,
            layoutNodes: tree.layouts
          });
        }
        return {
          ...result,
          screens,
          layoutIndex,
          initialRoute: result?.initialRoute ?? result?.initialScreen ?? initialScreen
        };
      }
    };
  }
}

StackLayout.scheduleAutoBoot();
