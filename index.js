import { TwAppInitial } from './switch-components/sw-app-initial.js';
import { TwTabsShell } from './switch-components/sw-tabs-shell.js';
import { TwAppShell } from './switch-components/sw-app-shell.js';
import { TwStackShell } from './switch-components/sw-stack-shell.js';
import { TwNotFoundScreen } from './switch-components/sw-not-found-screen.js';
import { TwSplashScreen } from './switch-components/sw-splash-screen.js';
import './switch-components/sw-redirect.js';
import { setGlobalComponentSheet, getGlobalComponentSheet, adoptGlobalComponentSheet } from './switch-components/globalStyles/index.js';
import { assertExpoConventions, registerScreens, ensureComponentDefined, registerComponents } from './registerScreens.js';
import {
  Stack,
  Tabs,
  Router,
  createGlobalStates,
  encodeData,
  decodeData,
  navigate,
  goBack,
  redirect,
  replace,
  reload,
  getActiveRoute
} from './router/index.js';
import { SwitchComponent, getCurrentComponent } from './registers/SwitchComponent.js';
import { TabLayout } from './registers/TabLayout.js';
import { StackLayout } from './registers/StackLayout.js';
import { FlatList } from './components/FlatList.js';
import {
  createState,
  useState as useStateRaw,
  updateState,
  getState,
  setState,
  subscribeState
} from './state-managers/index.js';
export { startApp } from './registers/index.js';
export { ensureComponentDefined as registerComponent } from './registerScreens.js';

const useEffect = (function createUseEffect() {
  return function useEffect(callback, deps = []) {
    const comp = getCurrentComponent();
    if (comp && typeof comp.useEffect === 'function') {
      return comp.useEffect(callback, deps);
    }
    return () => {};
  };
})();

function useState(identifier, callback) {
  if (typeof callback === 'undefined' || callback === null) {
    throw new Error('useState(identifier, callback) requires a callback. For static full re-render, use this.useState(identifier) in static {}.');
  }
  if (typeof callback !== 'function' && !Array.isArray(callback)) {
    throw new Error('useState(identifier, callback) requires a callback or array of callbacks.');
  }
  const [value, unsub] = useStateRaw(identifier, callback);
  const comp = getCurrentComponent();
  if (comp && comp._stateUnsubs) comp._stateUnsubs.push(unsub);
  return [value, unsub];
}

export function registerFramework() {
  if (!customElements.get('sw-app-initial')) customElements.define('sw-app-initial', TwAppInitial);
  if (!customElements.get('sw-tabs-shell')) customElements.define('sw-tabs-shell', TwTabsShell);
  if (!customElements.get('sw-stack-shell')) customElements.define('sw-stack-shell', TwStackShell);
  if (!customElements.get('sw-app-shell')) customElements.define('sw-app-shell', TwAppShell);
  if (!customElements.get('sw-not-found-screen')) customElements.define('sw-not-found-screen', TwNotFoundScreen);
  if (!customElements.get('sw-splash-screen')) customElements.define('sw-splash-screen', TwSplashScreen);
}

export {
  // base classes
  SwitchComponent,
  TabLayout,
  StackLayout,
  FlatList,
  // component/routing helpers
  Stack,
  Tabs,
  Router,
  createGlobalStates,
  registerScreens,
  assertExpoConventions,
  registerComponents,
  encodeData,
  decodeData,
  navigate,
  goBack,
  redirect,
  replace,
  reload,
  getActiveRoute,
  // state management
  createState,
  useState,
  useEffect,
  updateState,
  getState,
  setState,
  subscribeState,
  // global styles
  setGlobalComponentSheet,
  getGlobalComponentSheet,
  adoptGlobalComponentSheet,
  // elements
  TwAppInitial,
  TwTabsShell,
  TwStackShell,
  TwAppShell,
  TwNotFoundScreen
};

