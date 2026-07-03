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

  /** @param {'flatlist'|'titlebar'} [kind='flatlist'] */
  createRef(kind = 'flatlist') {
    const ref = {
      __switchRef: true,
      kind,
      _target: null
    };

    if (kind === 'titlebar') {
      ref.minimize = async () => ref._target?.minimize?.();
      ref.maximize = async () => ref._target?.maximize?.();
      ref.restore = async () => ref._target?.restore?.();
      ref.close = () => ref._target?.close?.();
      ref.toggleMaximize = async () => ref._target?.toggleMaximize?.();
      ref.refreshWindowState = async () => ref._target?.refreshWindowState?.();
      ref.getWindowState = () => ref._target?.getWindowState?.() ?? 'normal';
      ref.show = () => ref._target?.show?.();
      ref.hide = () => ref._target?.hide?.();
      ref.setVisible = (visible) => ref._target?.setVisible?.(visible);
      ref.getVisible = () => ref._target?.getVisible?.() ?? true;
      ref.toggleVisible = () => ref._target?.toggleVisible?.();
      return ref;
    }

    ref.scrollToIndex = ({ index, animated = true, viewOffset = 0, viewPosition } = {}) => {
      ref._target?.scrollToIndex?.({ index, animated, viewOffset, viewPosition });
    };

    ref.scrollToEnd = ({ animated = true } = {}) => {
      ref._target?.scrollToEnd?.({ animated });
    };

    ref.scrollToOffset = ({ offset, animated = true } = {}) => {
      ref._target?.scrollToOffset?.({ offset, animated });
    };

    ref.scrollBy = ({ x = 0, y = 0, animated = true } = {}) => {
      ref._target?.scrollBy?.({ x, y, animated });
    };

    ref.flashScrollIndicators = () => {
      ref._target?.flashScrollIndicators?.();
    };

    return ref;
  }

  bindRefTarget(ref, target) {
    if (ref && ref.__switchRef) ref._target = target || null;
  }

  registerStaticRef(Cls, propName, ref) {
    if (!Cls || !propName || !ref?.__switchRef) return ref;
    Object.defineProperty(Cls, propName, {
      value: ref,
      configurable: true,
      enumerable: true
    });
    if (!Cls.__staticRefs) Cls.__staticRefs = [];
    if (!Cls.__staticRefs.includes(propName)) Cls.__staticRefs.push(propName);
    return ref;
  }

  bindStaticRefs(instance) {
    const Cls = instance?.constructor;
    if (!Cls?.__staticRefs) return;
    for (const prop of Cls.__staticRefs) {
      this.bindRefTarget(Cls[prop], instance);
    }
  }

  bindInstanceRefs(instance) {
    if (!instance?._instanceRefs) return;
    for (const ref of instance._instanceRefs) {
      this.bindRefTarget(ref, instance);
    }
  }
}
