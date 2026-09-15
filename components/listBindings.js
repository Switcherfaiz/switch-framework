import { getState, hasState, ensureState, subscribeState } from '../state-managers/index.js';

const ORIENTATION_VALUES = new Set(['vertical', 'horizontal', 'both', 'x', 'y']);
const LAYOUT_VALUES = new Set(['none', 'stack', 'row', 'grid', 'masonry']);
const BOOL_VALUES = new Set(['true', 'false']);

function hasStateSafe(key) {
  if (typeof key !== 'string' || !key) return false;
  try { return hasState(key); } catch (_) { return false; }
}

export function getStateSafe(key, fallback) {
  if (typeof key !== 'string' || !key) return fallback;
  try {
    const value = getState(key);
    return value === undefined ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function looksLikeStateKey(value, literals) {
  if (typeof value !== 'string' || !value) return false;
  if (literals?.has(value)) return false;
  if (hasStateSafe(value)) return true;
  return /[-_.\/]/.test(value);
}

function coerce(name, value) {
  if (
    name === 'numColumns'
    || name === 'onEndReachedThreshold'
    || name === 'initialNumToRender'
    || name === 'maxToRenderPerBatch'
    || name === 'windowSize'
    || name === 'estimatedItemSize'
  ) {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (
    name === 'horizontal'
    || name === 'virtualized'
    || name === 'removeClippedSubviews'
    || name === 'showsVerticalScrollIndicator'
    || name === 'showsHorizontalScrollIndicator'
    || name === 'interceptBack'
    || name === 'transparent'
  ) {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
  }
  if (name === 'orientation') {
    if (value === 'x') return 'horizontal';
    if (value === 'y') return 'vertical';
  }
  return value;
}

function literalsFor(name) {
  if (name === 'orientation') return ORIENTATION_VALUES;
  if (name === 'layout') return LAYOUT_VALUES;
  if (
    name === 'horizontal'
    ||     name === 'virtualized'
    || name === 'removeClippedSubviews'
    || name === 'showsVerticalScrollIndicator'
    || name === 'showsHorizontalScrollIndicator'
    || name === 'interceptBack'
    || name === 'transparent'
  ) return BOOL_VALUES;
  return null;
}

function isLiteralProp(name, value) {
  if (value == null) return false;
  if (Array.isArray(value)) return true;
  const type = typeof value;
  if (type === 'boolean' || type === 'number') return true;
  if (type === 'object') return true;
  if (type !== 'string') return false;
  if (name === 'data') return false;
  const literals = literalsFor(name);
  if (literals?.has(value)) return true;
  if (name === 'numColumns' && value.trim() !== '' && Number.isFinite(Number(value))) return true;
  if (name === 'onEndReachedThreshold' && Number.isFinite(Number(value))) return true;
  if (name === 'horizontalItemWidth' && !looksLikeStateKey(value, null)) return true;
  return !looksLikeStateKey(value, literals);
}

/**
 * Resolve a ScrollView / FlatList field from props, static *State, or a static literal.
 *
 * Props may be a state key (`orientation: 'feed-axis'`) or a plain value
 * (`orientation: 'horizontal'`). Plain values are first-paint only — they do
 * not subscribe. State keys subscribe; the host decides patch vs remount.
 */
export function resolveBinding(host, name, fallback) {
  const props = typeof host.getProps === 'function' ? (host.getProps() || {}) : {};
  const Cls = host.constructor;
  const propVal = props[name];
  const staticKey = Cls?.[`${name}State`];
  const staticVal = Cls?.[name];

  if (propVal !== undefined && propVal !== null && propVal !== '') {
    if (isLiteralProp(name, propVal)) {
      return { mode: 'value', key: null, value: coerce(name, propVal) };
    }
    if (typeof propVal === 'string') {
      return { mode: 'state', key: propVal, value: getStateSafe(propVal, fallback) };
    }
    return { mode: 'value', key: null, value: coerce(name, propVal) };
  }

  if (typeof staticKey === 'string' && staticKey) {
    return { mode: 'state', key: staticKey, value: getStateSafe(staticKey, fallbackFor(name, staticVal, fallback)) };
  }

  if (['data', 'loading', 'error', 'refreshing'].includes(name)) {
    const tag = Cls?.tag || 'scroll-view';
    const defaultKey = `${tag}-${name}`;
    return { mode: 'state', key: defaultKey, value: getStateSafe(defaultKey, fallback) };
  }

  if (staticVal !== undefined && staticVal !== null && staticVal !== '') {
    return { mode: 'value', key: null, value: staticVal };
  }

  return { mode: 'value', key: null, value: fallback };
}

function fallbackFor(name, staticVal, fallback) {
  if (staticVal !== undefined && staticVal !== null && staticVal !== '') return staticVal;
  return fallback;
}

export function readBinding(host, name, fallback) {
  return resolveBinding(host, name, fallback).value;
}

export function ensureBinding(binding, initial) {
  if (binding?.mode !== 'state' || !binding.key) return;
  try { ensureState(binding.key, initial); } catch (_) {}
}

export function watchBinding(host, binding, onChange) {
  if (binding?.mode !== 'state' || !binding.key || typeof onChange !== 'function') return () => {};
  try {
    const unsub = subscribeState(binding.key, (next, prev) => onChange(next, prev), { immediate: false });
    if (host?._stateUnsubs) host._stateUnsubs.push(unsub);
    return unsub;
  } catch (_) {
    return () => {};
  }
}
