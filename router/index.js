import { Router } from './router.js';
import { createGlobalStates, encodeData, decodeData } from '../helpers/index.js';

export function Stack(config = {}) {
  return {
    ...config,
    layout: config.layout || 'stack'
  };
}

Stack.screen = (config = {}) => Stack(config);

export function Tabs(config = {}) {
  const name = config?.name || config?.container;
  return {
    ...config,
    name,
    layout: config.layout || 'tabs'
  };
}

Tabs.screen = (config = {}) => Tabs(config);

// Hook to get route parameters (:id style)
export function useParams() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    return globalStates.getState('routeParams') || {};
  }
  return {};
}

// Hook to get search parameters (?key=value style)
export function useSearchParams() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    return globalStates.getState('searchParams') || {};
  }
  return {};
}

/** Returns the current active route string (e.g. "docs/introduction") */
export function getActiveRoute() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    return globalStates.getState('activeRoute') || '';
  }
  return '';
}

/**
 * Subscribe to route changes. Accepts a callback that runs when the route changes.
 * Returns an unsubscribe function.
 * @param {() => void} callback
 * @returns {() => void} unsubscribe
 */
export function useRouteChangesSubscriber(callback) {
  if (typeof globalStates !== 'undefined' && globalStates.subscribe) {
    return globalStates.subscribe(callback);
  }
  return () => {};
}

// Navigation functions that work with globalStates
export function navigate(route, params = {}) {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    const navigateFn = globalStates.getState('navigate');
    if (typeof navigateFn === 'function') {
      return navigateFn(route, params);
    }
  }
  console.warn('Navigate function not available in globalStates');
}

export function goBack() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    const goBackFn = globalStates.getState('go_back');
    if (typeof goBackFn === 'function') {
      return goBackFn();
    }
  }
  window.history.back();
}

export function redirect(route, params = {}) {
  return navigate(route, params);
}

export function reload() {
  window.location.reload();
}

export function replace(route, params = {}) {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    const replaceFn = globalStates.getState('replace');
    if (typeof replaceFn === 'function') {
      return replaceFn(route, params);
    }
  }
  console.warn('Replace function not available in globalStates');
}

/** Returns array of defined route paths from registered screens */
export function getDefinedRoutes() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    const routes = globalStates.getState('definedRoutes') || [];
    return routes.map((r) => r.path);
  }
  return [];
}

/** Returns array of navigated routes in order, each { path, route, params, title } */
export function getActiveRoutes() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    return globalStates.getState('activeRoutesHistory') || [];
  }
  return [];
}

/**
 * Returns { route, params, title } for the previous route, or null.
 * @param {string} prefix - Route prefix e.g. 'docs'
 * @param {string[]} orderedIds - Optional ordered param values for dynamic routes (e.g. ['introduction','installation'])
 */
export function previousRoute(prefix = '', orderedIds = []) {
  const defined = globalStates?.getState?.('definedRoutes') || [];
  const active = globalStates?.getState?.('activeRoute') || '';
  const params = globalStates?.getState?.('routeParams') || {};

  if (orderedIds.length > 0) {
    const currentId = params.id || active.split('/').pop() || orderedIds[0];
    const idx = orderedIds.indexOf(currentId);
    if (idx <= 0) return null;
    const prevId = orderedIds[idx - 1];
    const route = prefix ? `${prefix}/${prevId}` : prevId;
    const titles = { introduction: 'Introduction', installation: 'Installation', quickstart: 'Quick Start', cli: 'CLI', router: 'Router', state: 'State Management', theming: 'Theming', animations: 'Animations', changelogs: 'Changelogs' };
    return { route, params: prevId ? { id: prevId } : {}, title: titles[prevId] || prevId };
  }

  const filtered = defined.filter((r) => !prefix || String(r.route).startsWith(prefix + '/') || r.route === prefix);
  const idx = filtered.findIndex((r) => r.route === active);
  if (idx <= 0) return null;
  const prev = filtered[idx - 1];
  return { route: prev.route, params: {}, title: prev.title };
}

/**
 * Returns { route, params, title } for the next route, or null.
 * @param {string} prefix - Route prefix e.g. 'docs'
 * @param {string[]} orderedIds - Optional ordered param values for dynamic routes
 */
export function nextRoute(prefix = '', orderedIds = []) {
  const defined = globalStates?.getState?.('definedRoutes') || [];
  const active = globalStates?.getState?.('activeRoute') || '';
  const params = globalStates?.getState?.('routeParams') || {};

  if (orderedIds.length > 0) {
    const currentId = params.id || active.split('/').pop() || orderedIds[0];
    const idx = orderedIds.indexOf(currentId);
    if (idx < 0 || idx >= orderedIds.length - 1) return null;
    const nextId = orderedIds[idx + 1];
    const route = prefix ? `${prefix}/${nextId}` : nextId;
    const titles = { introduction: 'Introduction', installation: 'Installation', quickstart: 'Quick Start', cli: 'CLI', router: 'Router', state: 'State Management', theming: 'Theming', animations: 'Animations', changelogs: 'Changelogs' };
    return { route, params: nextId ? { id: nextId } : {}, title: titles[nextId] || nextId };
  }

  const filtered = defined.filter((r) => !prefix || String(r.route).startsWith(prefix + '/') || r.route === prefix);
  const idx = filtered.findIndex((r) => r.route === active);
  if (idx < 0 || idx >= filtered.length - 1) return null;
  const next = filtered[idx + 1];
  return { route: next.route, params: {}, title: next.title };
}

export {
  Router,
  createGlobalStates,
  encodeData,
  decodeData
};

