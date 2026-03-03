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

export {
  Router,
  createGlobalStates,
  encodeData,
  decodeData
};

