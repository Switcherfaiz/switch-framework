const _symbolToStates = new Map();
const _pendingSymbols = [];

export function registerStaticState(symbol, identifier, options = {}) {
  if (!_symbolToStates.has(symbol)) {
    _symbolToStates.set(symbol, []);
  }
  const arr = _symbolToStates.get(symbol);
  if (!arr.includes(identifier)) arr.push(identifier);
  if (options.pending !== false) _pendingSymbols.push(symbol);
}

export function getStatesForSymbol(symbol) {
  return _symbolToStates.get(symbol) || [];
}

export function registerStaticStates(Cls) {
  if (_pendingSymbols.length > 0) {
    const existing = Cls.states;
    const arr = Array.isArray(existing) ? [...existing] : [];
    arr.push(..._pendingSymbols);
    Cls.states = arr;
    _pendingSymbols.length = 0;
  }
}

export function clearFromPending(symbols) {
  const set = new Set(symbols);
  for (let i = _pendingSymbols.length - 1; i >= 0; i--) {
    if (set.has(_pendingSymbols[i])) _pendingSymbols.splice(i, 1);
  }
}

export function getStaticStateRegistry() {
  return _symbolToStates;
}
