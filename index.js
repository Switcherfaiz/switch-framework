import { TwAppInitial } from './switch-components/sw-app-initial.js';
import { TwTabsShell } from './switch-components/sw-tabs-shell.js';
import { TwAppShell } from './switch-components/sw-app-shell.js';
import { TwStackShell } from './switch-components/sw-stack-shell.js';
import { TwNotFoundScreen } from './switch-components/sw-not-found-screen.js';
import { TwSplashScreen } from './switch-components/sw-splash-screen.js';
import './switch-components/sw-redirect.js';
import { setGlobalComponentSheet, getGlobalComponentSheet, adoptGlobalComponentSheet } from './switch-components/globalStyles/index.js';
import { assertExpoConventions, registerScreens } from './registerScreens.js';
import {
  Stack,
  Tabs,
  Router,
  createGlobalStates,
  encodeData,
  decodeData
} from './router/index.js';
import {
  createState,
  useState,
  updateState,
  getState,
  setState,
  subscribeState
} from './state-managers/index.js';

export { startApp } from './registers/index.js';

export function registerFramework() {
  if (!customElements.get('sw-app-initial')) customElements.define('sw-app-initial', TwAppInitial);
  if (!customElements.get('sw-tabs-shell')) customElements.define('sw-tabs-shell', TwTabsShell);
  if (!customElements.get('sw-stack-shell')) customElements.define('sw-stack-shell', TwStackShell);
  if (!customElements.get('sw-app-shell')) customElements.define('sw-app-shell', TwAppShell);
  if (!customElements.get('sw-not-found-screen')) customElements.define('sw-not-found-screen', TwNotFoundScreen);
  if (!customElements.get('sw-splash-screen')) customElements.define('sw-splash-screen', TwSplashScreen);
}

export {
  // component/routing helpers
  Stack,
  Tabs,
  Router,
  createGlobalStates,
  registerScreens,
  assertExpoConventions,
  encodeData,
  decodeData,
  // state management
  createState,
  useState,
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

