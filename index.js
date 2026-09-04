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
  getActiveRoute,
  isScreenActive,
  isScreenInstanceActive,
  useScreenFocus,
  useParams
} from './router/index.js';
import { createProps } from './helpers/index.js';
import { SwitchComponent, getCurrentComponent } from './registers/SwitchComponent.js';
import { TabLayout } from './registers/TabLayout.js';
import { StackLayout } from './registers/StackLayout.js';
import { FlatList } from './components/FlatList.js';
import { ElectronTitleBar } from './components/ElectronTitleBar.js';
import {
  createState,
  ensureState,
  hasState,
  useState as useStateRaw,
  updateState,
  getState,
  setState,
  subscribeState,
  createRef,
  bindRefTarget
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

/**
 * Dual-mode hook:
 *
 * New React-style (preferred):
 *   const [value, setValue] = useState(initialValue)
 *   Local to this component instance. Calling setValue() triggers a full rerender
 *   of this component only. No global key needed.
 *
 * Old callback style (deprecated – use onState() instead):
 *   useState('state-key', callbackFn)
 *   Subscribes to a global state key and calls callbackFn on change.
 *   Does NOT trigger a full rerender; use for fine-grained DOM patches.
 */
function useState(identifierOrInitial, callback) {
  // Old style: useState('key', fn) — deprecated, prefer onState()
  if (callback !== undefined) {
    if (typeof callback !== 'function' && !Array.isArray(callback)) {
      throw new Error('useState(key, callback): second argument must be a function.');
    }
    const [value, unsub] = useStateRaw(identifierOrInitial, callback);
    const comp = getCurrentComponent();
    if (comp && comp._stateUnsubs) comp._stateUnsubs.push(unsub);
    return [value, unsub];
  }

  // New React-style: useState(initialValue) → [value, setter]
  const comp = getCurrentComponent();
  if (!comp) return [identifierOrInitial, () => {}];

  const index = comp._localStateIndex++;
  if (!comp._localSlots) comp._localSlots = [];
  if (comp._localSlots[index] === undefined) {
    comp._localSlots[index] = identifierOrInitial;
  }

  const value = comp._localSlots[index];
  const set = (next) => {
    const cur = comp._localSlots[index];
    const val = typeof next === 'function' ? next(cur) : next;
    if (Object.is(cur, val)) return;
    comp._localSlots[index] = val;
    if (!comp._isRendering) comp.rerender();
  };
  return [value, set];
}

/**
 * Screen-level state stored on this component instance (like constructor fields).
 * Not global — other screens cannot read it with getState().
 *
 * @param {*} initialValue - Initial value or factory `() => value`
 * @param {{ rerender?: boolean }} [options]
 *   - rerender: true (default) calls rerender() after set
 *   - rerender: false only updates memory (pair with this.paint() or onState)
 */
function useInstanceState(initialValue, options = {}) {
  const { rerender: shouldRerender = true } = options;
  const comp = getCurrentComponent();
  if (!comp) {
    const fallback = typeof initialValue === 'function' ? initialValue() : initialValue;
    return [fallback, () => {}];
  }

  const index = comp._instanceSlotIndex++;
  if (!comp._instanceSlots) comp._instanceSlots = [];
  if (comp._instanceSlots[index] === undefined) {
    comp._instanceSlots[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
  }

  const value = comp._instanceSlots[index];
  const set = (next, setOptions = {}) => {
    const cur = comp._instanceSlots[index];
    const val = typeof next === 'function' ? next(cur) : next;
    if (Object.is(cur, val)) return;
    comp._instanceSlots[index] = val;
    const rerenderNow = setOptions.rerender ?? shouldRerender;
    if (rerenderNow && !comp._isRendering) comp.rerender();
  };
  return [value, set];
}

/**
 * Subscribe this component to a global shared state key and return its current value.
 * When the shared state changes, this component rerenders automatically.
 * The returned setter is equivalent to updateState(key, next).
 *
 * **Idempotent creation:** if the key does not exist yet, it is created automatically
 * using `defaultValue` as the initial value. This means you no longer need a separate
 * `createState` call for feature-level states — only app-boot states that must exist
 * before the first render (e.g. in `_layout.js`) still need explicit `createState`.
 *
 * @example
 *   // In render(), effects(), or onMount():
 *   const [pins, setPins] = useShared('pins', []);
 *   setPins([...newPins]); // updates global state, all subscribers rerender
 *
 *   // Feature-level state — no createState needed anywhere:
 *   const [tags, setTags] = useShared('home-tags', ['All']);
 *
 * @param {string} key - Global state identifier
 * @param {*} [defaultValue] - Initial value if the key does not exist yet; also used
 *   as fallback when the stored value is undefined.
 */
function useShared(key, defaultValue) {
  ensureState(key, defaultValue !== undefined ? defaultValue : null);

  const comp = getCurrentComponent();
  if (comp) {
    if (!comp._sharedSubscribedKeys) comp._sharedSubscribedKeys = new Set();
    // Skip the rerender subscription if onState() already owns this key —
    // onState takes priority so only the callback fires, not a full rerender.
    const ownedByOnState = comp._onStateMap?.has(key);
    if (!comp._sharedSubscribedKeys.has(key) && !ownedByOnState) {
      comp._sharedSubscribedKeys.add(key);
      try {
        const unsub = subscribeState(key, () => {
          if (!comp._isRendering) comp.rerender();
        }, { immediate: false });
        // Store by key so onState() can cancel this subscription later
        if (!comp._sharedUnsubs) comp._sharedUnsubs = new Map();
        comp._sharedUnsubs.set(key, unsub);
        if (comp._stateUnsubs) comp._stateUnsubs.push(unsub);
      } catch (_) {}
    }
  }

  let value;
  try { value = getState(key); } catch (_) { value = undefined; }
  if (value === undefined && defaultValue !== undefined) value = defaultValue;

  const setter = (next) => { try { updateState(key, next); } catch (_) {} };
  return [value, setter];
}

/**
 * Subscribe to a global state key and run a callback on change — without triggering
 * a full rerender. Use this for fine-grained DOM patches (CSS animation toggles,
 * live counters, class swaps) where replacing innerHTML would reset state.
 *
 * Call from onMount(). Subscriptions are deduped per key — calling onState with
 * the same key on every rerender safely updates the callback reference.
 *
 * @example
 *   onMount() {
 *     onState('liked', (liked) => {
 *       const btn = this.select('.heart');
 *       btn?.classList.toggle('liked', liked);
 *     });
 *   }
 *
 * @param {string} key - Global state identifier
 * @param {(newValue: any, oldValue: any) => void} callback
 */
function onState(key, callback) {
  const comp = getCurrentComponent();
  if (!comp || typeof callback !== 'function') return () => {};

  if (!comp._onStateMap) comp._onStateMap = new Map();

  if (comp._onStateMap.has(key)) {
    // Update callback reference without adding a new subscription
    comp._onStateMap.get(key).cb = callback;
    return comp._onStateMap.get(key).unsub;
  }

  const slot = { cb: callback, unsub: () => {} };
  try {
    slot.unsub = subscribeState(key, (newVal, oldVal) => slot.cb?.(newVal, oldVal), { immediate: false });
    if (comp._stateUnsubs) comp._stateUnsubs.push(slot.unsub);
  } catch (_) {}

  comp._onStateMap.set(key, slot);

  // If useShared previously wired a rerender subscription for this key,
  // cancel it now — onState takes priority (callback-only, no full rerender).
  if (comp._sharedUnsubs?.has(key)) {
    try { comp._sharedUnsubs.get(key)(); } catch (_) {}
    comp._sharedUnsubs.delete(key);
    comp._sharedSubscribedKeys?.delete(key);
  }

  return slot.unsub;
}

function useRef(target) {
  const ref = createRef('flatlist');
  const comp = target || getCurrentComponent();
  bindRefTarget(ref, comp);
  if (comp) {
    comp._instanceRefs = comp._instanceRefs || [];
    comp._instanceRefs.push(ref);
  }
  return ref;
}

export function registerFramework() {
  if (!customElements.get('sw-app-initial')) customElements.define('sw-app-initial', TwAppInitial);
  if (!customElements.get('sw-tabs-shell')) customElements.define('sw-tabs-shell', TwTabsShell);
  if (!customElements.get('sw-stack-shell')) customElements.define('sw-stack-shell', TwStackShell);
  if (!customElements.get('sw-app-shell')) customElements.define('sw-app-shell', TwAppShell);
  if (!customElements.get('sw-not-found-screen')) customElements.define('sw-not-found-screen', TwNotFoundScreen);
  if (!customElements.get('sw-splash-screen')) customElements.define('sw-splash-screen', TwSplashScreen);
  if (!customElements.get('sw-electron-titlebar')) customElements.define('sw-electron-titlebar', ElectronTitleBar);
}

export {
  // base classes
  SwitchComponent,
  TabLayout,
  StackLayout,
  FlatList,
  ElectronTitleBar,
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
  createProps,
  navigate,
  goBack,
  redirect,
  replace,
  reload,
  getActiveRoute,
  isScreenActive,
  isScreenInstanceActive,
  useScreenFocus,
  useParams,
  // state management
  createState,
  ensureState,
  hasState,
  useState,
  useShared,
  useInstanceState,
  onState,
  useEffect,
  useRef,
  createRef,
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

