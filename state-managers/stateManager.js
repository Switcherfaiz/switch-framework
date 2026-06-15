/**
 * SwitchStateManager – lightweight reactive state for Switch Framework
 * Create named states, subscribe from anywhere, update from anywhere.
 */
export class SwitchStateManager {
  constructor() {
    this.states = new Map();
    // Stores a human-readable hint about where each state was first defined.
    // Used to improve duplicate-state errors.
    this.stateCreators = new Map();
    this.eventTarget = new EventTarget();
  }

  _guessOwnerFromStack(stack) {
    if (!stack) return null;
    const lines = String(stack).split('\n').map((l) => l.trim()).filter(Boolean);

    // Skip framework internals so the first "real" user class comes back.
    const isInternalFrame = (line) => {
      const s = String(line);
      return (
        /SwitchStateManager\b/.test(s) ||
        /stateManager\.js\b/.test(s) ||
        /state-managers\b/.test(s) ||
        /_guessOwnerFromStack\b/.test(s) ||
        /\bcreateState\b/.test(s) ||
        /\bsetState\b/.test(s) ||
        /\bupdateState\b/.test(s)
      );
    };

    for (const l of lines) {
      if (isInternalFrame(l)) continue;

      // Typical browser stacks: "at MyComponent.someFn (file:line:col)"
      const ownerFromDot = l.match(/^at\s+([A-Za-z_$][\w$]*)\./);
      if (ownerFromDot?.[1]) {
        const owner = ownerFromDot[1];
        const badOwners = new Set(['SwitchStateManager', 'blob', 'Blob', 'anonymous', 'Anonymous', 'Object']);
        if (owner && !badOwners.has(owner)) return owner;
      }

      // Fallback: "at MyComponent (file:line:col)"
      const owner = l.match(/^at\s+([A-Za-z_$][\w$]*)/);
      if (owner?.[1]) {
        const badOwners = new Set(['SwitchStateManager', 'blob', 'Blob', 'anonymous', 'Anonymous', 'Object']);
        if (!badOwners.has(owner[1])) return owner[1];
      }
    }

    return null;
  }

  createState(identifier, initialValue) {
    if (typeof identifier !== 'string' || !identifier.trim()) {
      throw new Error('State identifier must be a non-empty string.');
    }

    if (this.states.has(identifier)) {
      const existing = this.stateCreators.get(identifier);
      const owner = existing?.owner ? `${existing.owner} component` : 'unknown component';
      throw new Error(`State identifier "${identifier}" already exists. First defined on ${owner}.`);
    }

    const creatorOwner = this._guessOwnerFromStack(new Error().stack);
    this.stateCreators.set(identifier, { owner: creatorOwner || null });
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
