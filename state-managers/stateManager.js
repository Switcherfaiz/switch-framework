/**
 * SwitchStateManager – lightweight reactive state for Switch Framework
 * Create named states, subscribe from anywhere, update from anywhere.
 */
export class SwitchStateManager {
  constructor() {
    this.states = new Map();
    this.eventTarget = new EventTarget();
  }

  createState(initialValue, identifier) {
    if (typeof identifier !== 'string' || !identifier.trim()) {
      throw new Error('State identifier must be a non-empty string.');
    }

    if (this.states.has(identifier)) {
      throw new Error(`State identifier "${identifier}" already exists.`);
    }

    this.states.set(identifier, { value: initialValue });

    const getter = () => this.getState(identifier);
    const setter = (newValueOrUpdater) => this.setState(identifier, newValueOrUpdater);

    return [getter, setter];
  }

  getState(identifier) {
    const state = this.states.get(identifier);

    if (!state) {
      throw new Error(`State "${identifier}" does not exist.`);
    }

    return state.value;
  }

  setState(identifier, newValueOrUpdater) {
    const state = this.states.get(identifier);

    if (!state) {
      throw new Error(`State "${identifier}" does not exist.`);
    }

    const oldValue = state.value;
    const newValue =
      typeof newValueOrUpdater === 'function'
        ? newValueOrUpdater(oldValue)
        : newValueOrUpdater;

    if (Object.is(oldValue, newValue)) return;

    state.value = newValue;

    this.eventTarget.dispatchEvent(
      new CustomEvent(this.getEventName(identifier), {
        detail: {
          stateName: identifier,
          newValue,
          oldValue
        }
      })
    );
  }

  /**
   * Alias for setState – update any state by identifier from anywhere.
   * Use this when you don't have the setter from createState.
   */
  updateState(identifier, newValueOrUpdater) {
    return this.setState(identifier, newValueOrUpdater);
  }

  subscribe(identifier, callback, options = {}) {
    if (!this.states.has(identifier)) {
      throw new Error(`State "${identifier}" does not exist.`);
    }

    const eventName = this.getEventName(identifier);

    const handler = (event) => {
      callback(event.detail.newValue, event.detail.oldValue, event);
    };

    this.eventTarget.addEventListener(eventName, handler);

    if (options.immediate !== false) {
      callback(this.getState(identifier), undefined, null);
    }

    return () => {
      this.eventTarget.removeEventListener(eventName, handler);
    };
  }

  getEventName(identifier) {
    return `switchstate:${identifier}`;
  }
}
