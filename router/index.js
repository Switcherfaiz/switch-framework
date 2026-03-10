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

export {
  Router,
  createGlobalStates,
  encodeData,
  decodeData
};

