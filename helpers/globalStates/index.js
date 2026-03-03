class States {
  constructor() {
    this.state = {};
    this.listeners = new Set();
  }

  setState(newState = {}) {
    this.state = Object.assign(this.state, newState);
    this.listeners.forEach((fn) => {
      try { fn(this.state); } catch (e) {}
    });
  }

  getState(stateKey = "") {
    return stateKey ? this.state[stateKey] : this.state;
  }

  removeState(stateKey = "") {
    if (!stateKey) {
      this.state = {};
      return true;
    }
    if (Object.prototype.hasOwnProperty.call(this.state, stateKey)) {
      delete this.state[stateKey];
      return true;
    }
    return false;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createGlobalStates() {
  return new States();
}
