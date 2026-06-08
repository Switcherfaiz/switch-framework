import { SwitchStateManager } from './stateManager.js';

const stateManager = new SwitchStateManager();

/** Create a new state. Returns [getValue, setValue]. */
export const createState = stateManager.createState.bind(stateManager);

/** Get current value of a state by identifier. */
export const getState = stateManager.getState.bind(stateManager);

/** Set/update a state by identifier. Accepts value or updater function. */
export const setState = stateManager.setState.bind(stateManager);

/**
 * Update any state by identifier from anywhere in the app.
 * Same as setState – use when you don't have the setter from createState.
 */
export const updateState = stateManager.updateState.bind(stateManager);

/** Subscribe to state changes. Returns unsubscribe function. */
export const subscribeState = stateManager.subscribe.bind(stateManager);

/**
 * Hook to consume a state in a component.
 * @param {string} identifier - State identifier
 * @param {((newValue, oldValue, event) => void) | ((newValue, oldValue, event) => void)[]} [callback] - Callback or array of callbacks. Called on each update (and immediately with current value)
 * @returns {[any, () => void]} [currentValue, unsubscribe]
 */
export function useState(identifier, callback) {
  const callbacks = Array.isArray(callback) ? callback : (callback ? [callback] : []);
  const cb = (newVal, oldVal, ev) => callbacks.forEach((fn) => { if (typeof fn === 'function') fn(newVal, oldVal, ev); });
  const options = callbacks.length > 0 ? { immediate: true } : { immediate: true };

  const unsubscribe = stateManager.subscribe(identifier, cb, options);
  const currentValue = stateManager.getState(identifier);

  return [currentValue, unsubscribe];
}

/** Alias for subscribe – returns unsubscribe. Use when you need more control. */
export const unsubscribeState = (unsubscribeFn) => {
  if (typeof unsubscribeFn === 'function') unsubscribeFn();
};

export default stateManager;
