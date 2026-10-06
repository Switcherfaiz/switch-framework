import { TwAppInitial } from './switch-components/sw-app-initial.js';
import { TwTabsShell } from './switch-components/sw-tabs-shell.js';
import { TwAppShell } from './switch-components/sw-app-shell.js';
import { TwStackShell } from './switch-components/sw-stack-shell.js';
import { TwNotFoundScreen } from './switch-components/sw-not-found-screen.js';
import { TwSplashScreen } from './switch-components/sw-splash-screen.js';
import { FlatList } from './components/FlatList.js';
import { ScrollView } from './components/ScrollView.js';
import { Modal } from './components/Modal.js';
import { ElectronTitleBar } from './components/ElectronTitleBar.js';

export function registerFramework() {
  if (!customElements.get('sw-app-initial')) customElements.define('sw-app-initial', TwAppInitial);
  if (!customElements.get('sw-tabs-shell')) customElements.define('sw-tabs-shell', TwTabsShell);
  if (!customElements.get('sw-stack-shell')) customElements.define('sw-stack-shell', TwStackShell);
  if (!customElements.get('sw-app-shell')) customElements.define('sw-app-shell', TwAppShell);
  if (!customElements.get('sw-not-found-screen')) customElements.define('sw-not-found-screen', TwNotFoundScreen);
  if (!customElements.get('sw-splash-screen')) customElements.define('sw-splash-screen', TwSplashScreen);
  if (!customElements.get('sw-electron-titlebar')) customElements.define('sw-electron-titlebar', ElectronTitleBar);
  if (!customElements.get('sw-scroll-view')) customElements.define('sw-scroll-view', ScrollView);
  if (!customElements.get('sw-flat-list')) customElements.define('sw-flat-list', FlatList);
  if (!customElements.get('sw-modal')) customElements.define('sw-modal', Modal);
}
