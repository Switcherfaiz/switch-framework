const DEFAULT_TITLEBAR_TAG = 'sw-electron-titlebar';

let registeredTitleBarTag = null;

function isSubclassOf(Cls, Base) {
  let proto = Cls?.prototype;
  while (proto) {
    if (proto.constructor === Base) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

/**
 * Records a custom ElectronTitleBar subclass registered via registerComponents.
 * The app shell uses the most recently registered extension instead of the default tag.
 */
export function registerElectronTitleBarClass(Cls, ElectronTitleBar) {
  if (!Cls?.tag || !ElectronTitleBar) return;
  if (Cls === ElectronTitleBar || !isSubclassOf(Cls, ElectronTitleBar)) return;
  if (typeof ElectronTitleBar.registerStates === 'function') {
    ElectronTitleBar.registerStates(Cls);
  }
  if (Cls.tag !== DEFAULT_TITLEBAR_TAG) {
    registeredTitleBarTag = Cls.tag;
  }
}

export function getRegisteredTitleBarTag() {
  return registeredTitleBarTag;
}

export function getDefaultTitleBarTag() {
  return DEFAULT_TITLEBAR_TAG;
}
