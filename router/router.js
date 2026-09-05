import { encodeData } from '../helpers/index.js';

export class Router {
  constructor(routes = {}, updateTitleCallback = null, containerEl = null, onRouteChange = null, options = {}) {
    this.routes = routes;
    this.updateTitleCallback = updateTitleCallback;
    this.containerEl = containerEl;
    this.onRouteChange = onRouteChange;
    this.defaultRoute = options.defaultRoute ?? null;
    this.titlePrefix = options.titlePrefix ?? '';
    this.navigate = this.navigate.bind(this);
    this.redirect = this.redirect.bind(this);
    this.replace = this.replace.bind(this);
    this.handlePopState = this.handlePopState.bind(this);
    this.renderScreen = this.renderScreen.bind(this);
    this.findRoute = this.findRoute.bind(this);
    this.buildPath = this.buildPath.bind(this);
    this.start = this.start.bind(this);

    this._lockedRoute = null;
    // Cache of rendered screen elements: key = normalizedRoute, value = { element, params }
    this._screenCache = new Map();

    window.addEventListener('popstate', this.handlePopState);
  }

  escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  getNotFoundRouteKey() {
    if (!this.routes) return null;
    const entries = Object.entries(this.routes);
    const byKey = ['+not-found', 'not-found', '404'].find((k) => this.routes[k]);
    if (byKey) return byKey;
    const byPath = entries.find(([, r]) => r?.path === '/+not-found');
    return byPath ? byPath[0] : null;
  }

  renderNotFound(missingRoute = '', additionalProps = {}) {
    const missingPath = window.location.pathname || '';
    const notFoundKey = this.getNotFoundRouteKey();

    if (notFoundKey && missingRoute !== notFoundKey) {
      const route = this.routes[notFoundKey];
      if (route) {
        const effectiveParams = { ...additionalProps, missingRoute, missingPath };
        const routeInfo = {
          normalizedRoute: notFoundKey,
          route,
          fullPath: missingPath,
          params: effectiveParams
        };
        
        // Push the not-found route to history with the actual missing path
        history.pushState({ route: notFoundKey, params: effectiveParams }, '', missingPath);
        
        const containerFromCallback = typeof this.onRouteChange === 'function' ? this.onRouteChange(routeInfo) : null;
        const container = containerFromCallback || this.containerEl;
        const screenContent = typeof route.render === 'function' ? route.render(effectiveParams) : route.render;
        if (this.updateTitleCallback) this.updateTitleCallback(notFoundKey);
        if (container) this._showScreen(container, notFoundKey, screenContent, effectiveParams);
        const baseTitle = route.title || 'Not Found';
        document.title = this.titlePrefix ? (baseTitle ? `${this.titlePrefix} - ${baseTitle}` : this.titlePrefix) : baseTitle;
        return routeInfo;
      }
    }

    const normalizedMissing = missingRoute.startsWith('/') ? missingRoute.substring(1) : missingRoute;
    const routeInfo = {
      normalizedRoute: normalizedMissing,
      route: { title: 'Not Found', layout: 'stack' },
      fullPath: missingPath,
      params: { ...additionalProps, missingRoute: normalizedMissing, missingPath }
    };

    const containerFromCallback = typeof this.onRouteChange === 'function' ? this.onRouteChange(routeInfo) : null;
    const container = containerFromCallback || this.containerEl;
    if (container) this._showScreen(container, '+not-found', `<sw-not-found-screen></sw-not-found-screen>`, routeInfo.params);
    document.title = this.titlePrefix ? `${this.titlePrefix} - Not Found` : 'Not Found';
    return routeInfo;
  }

  start(initialRoute) {
    const fullPath = window.location.pathname || '/';
    const routingPath = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
    if (routingPath) {
      const info = this.renderScreen(routingPath, {});
      if (!info) return this.renderNotFound(routingPath, {});

      if (info.fullPath && info.fullPath !== fullPath) {
        history.replaceState({ route: info.normalizedRoute, params: info.params }, '', info.fullPath);
      }

      return info;
    }

    const targetRoute = initialRoute ?? this.defaultRoute;
    if (targetRoute) return this.navigate(targetRoute);
    return this.renderNotFound('', {});
  }

  extractParamsFromRoute(normalized, route) {
    const pathTemplate = route?.path;
    if (!pathTemplate || !String(pathTemplate).includes(':')) return {};

    const templateSegments = String(pathTemplate).replace(/^\//, '').split('/');
    const routeSegments = String(normalized).replace(/^\//, '').split('/');
    if (templateSegments.length !== routeSegments.length) return {};

    return templateSegments.reduce((acc, seg, idx) => {
      if (seg.startsWith(':')) acc[seg.slice(1).replace(/\?$/, '')] = routeSegments[idx] || '';
      return acc;
    }, {});
  }

  findRoute(routeName, params = {}) {
    const normalized = routeName.startsWith('/') ? routeName.substring(1) : routeName;
    
    // PRIORITY 1: Check for EXACT static match first (highest priority)
    // This ensures /home matches /home, not /home/:id
    if (this.routes[normalized]) {
      const route = this.routes[normalized];
      const pathTemplate = route.path || '';
      
      // If it's a pure static route (no params), use it immediately
      if (!pathTemplate.includes(':')) {
        return { ...route, render: () => route.render(params) };
      }
    }

    // PRIORITY 2: Check for exact matches in route paths (e.g., path: '/home' matches 'home')
    const exactMatches = Object.entries(this.routes).filter(([, route]) => {
      const path = (route.path || '').replace(/^\//, '');
      return path === normalized && !path.includes(':');
    });
    
    if (exactMatches.length > 0) {
      const [, route] = exactMatches[0];
      return { ...route, render: () => route.render(params) };
    }

    // PRIORITY 3: Dynamic routes (routes with parameters)
    const dynamicRoutes = Object.entries(this.routes).filter(
      ([, route]) => (route.path || '').includes(':')
    );

    // Sort by specificity: fewer params = more specific, static segments count more
    dynamicRoutes.sort(([, routeA], [, routeB]) => {
      const aPath = routeA.path || '';
      const bPath = routeB.path || '';
      
      const aSegments = aPath.replace(/^\//, '').split('/');
      const bSegments = bPath.replace(/^\//, '').split('/');
      
      // Count static vs dynamic segments
      const aStatic = aSegments.filter(seg => !seg.startsWith(':')).length;
      const bStatic = bSegments.filter(seg => !seg.startsWith(':')).length;
      
      // More static segments = more specific (higher priority)
      if (aStatic !== bStatic) return bStatic - aStatic;
      
      // Fewer total segments = more specific
      return aSegments.length - bSegments.length;
    });

    // Try to match dynamic routes (`:id` required, `:id?` optional)
    const routeSegments = normalized.split('/');
    
    for (const [routeKey, route] of dynamicRoutes) {
      const pathTemplate = route.path || '/' + routeKey;
      const patternSegments = pathTemplate.replace(/^\//, '').split('/');
      const last = patternSegments[patternSegments.length - 1] || '';
      const lastOptional = last.startsWith(':') && last.endsWith('?');
      const requiredCount = lastOptional ? patternSegments.length - 1 : patternSegments.length;

      if (routeSegments.length !== patternSegments.length && !(lastOptional && routeSegments.length === requiredCount)) {
        continue;
      }

      const dynamicParams = {};
      let isMatch = true;

      for (let i = 0; i < patternSegments.length; i++) {
        const patternSegment = patternSegments[i];
        const routeSegment = routeSegments[i];
        const optional = patternSegment.startsWith(':') && patternSegment.endsWith('?');
        const paramName = patternSegment.startsWith(':')
          ? patternSegment.slice(1).replace(/\?$/, '')
          : '';
        
        if (patternSegment.startsWith(':')) {
          if (routeSegment == null && optional) {
            dynamicParams[paramName] = '';
          } else if (routeSegment == null) {
            isMatch = false;
            break;
          } else {
            dynamicParams[paramName] = routeSegment;
          }
        } else if (patternSegment !== routeSegment) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        const resolvedParams = { ...params, ...dynamicParams };
        return { ...route, _resolvedParams: resolvedParams, _useNormalized: true, render: () => route.render(resolvedParams) };
      }
    }

    // PRIORITY 4: Fallback - try matching a parent prefix route
    const segments = normalized.split('/');
    if (segments.length > 1) {
      for (let i = segments.length - 1; i >= 1; i--) {
        const prefix = segments.slice(0, i).join('/');
        if (this.routes[prefix]) {
          const subPath = segments.slice(i).join('/');
          const r = this.routes[prefix];
          const pathTemplate = r.path || '';
          const paramMatch = pathTemplate.match(/:(\w+)/);
          const nextParams = { ...params, _subPath: subPath };
          if (paramMatch) nextParams[paramMatch[1]] = subPath;
          return { ...r, _matchedKey: prefix, _useNormalized: true, _resolvedParams: nextParams, render: () => r.render(nextParams) };
        }
      }
    }

    return null;
  }

  buildPath(route, params) {
    let path = route.path || '';
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value == null || value === '') {
        path = path.replace(`:${key}?`, '').replace(`:${key}`, '');
      } else {
        path = path.replace(`:${key}?`, encodeURIComponent(String(value))).replace(`:${key}`, encodeURIComponent(String(value)));
      }
    });
    path = path.replace(/\/:[^/]+\?/g, '').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    return path.startsWith('/') ? path : '/' + path;
  }

  /**
   * Keep screens mounted. Each route gets its own scroll slot so going back
   * restores position (React Navigation / Expo Router style, not React web).
   */
  _prepareScreenHost(container) {
    if (!container || container._swScreenHost) return;
    container._swScreenHost = true;
    const style = container.style;
    if (!style.position || style.position === 'static') style.position = 'relative';
    style.overflow = 'hidden';
    if (!style.height && !style.minHeight) style.height = '100%';
  }

  _styleScreenSlot(slot) {
    slot.style.cssText = [
      'position:absolute',
      'inset:0',
      'width:100%',
      'height:100%',
      'overflow:auto',
      'overflow-x:hidden',
      '-webkit-overflow-scrolling:touch',
      'overscroll-behavior:contain',
      'box-sizing:border-box',
      'padding-bottom:var(--sw-screen-pad-bottom, 0px)'
    ].join(';');
  }

  _hideScreenSlot(slot, cached) {
    if (!slot) return;
    if (cached) cached.scrollTop = slot.scrollTop;
    slot.setAttribute('data-sw-active', 'false');
    slot.setAttribute('aria-hidden', 'true');
    slot.inert = true;
    slot.style.visibility = 'hidden';
    slot.style.pointerEvents = 'none';
    slot.style.zIndex = '0';
  }

  _showScreenSlot(slot, cached) {
    if (!slot) return;
    slot.setAttribute('data-sw-active', 'true');
    slot.removeAttribute('aria-hidden');
    slot.inert = false;
    slot.style.visibility = 'visible';
    slot.style.pointerEvents = 'auto';
    slot.style.zIndex = '1';
    const top = cached?.scrollTop || 0;
    requestAnimationFrame(() => {
      slot.scrollTop = top;
    });
  }

  _showScreen(container, cacheKey, screenContent, params = {}, options = {}) {
    if (!container) return;
    this._prepareScreenHost(container);

    Array.from(container.children).forEach((child) => {
      const cachedChild = [...this._screenCache.values()].find((entry) => entry.slot === child);
      this._hideScreenSlot(child, cachedChild);
    });

    const cached = this._screenCache.get(cacheKey);
    if (cached?.slot && container.contains(cached.slot)) {
      this._showScreenSlot(cached.slot, cached);
      const el = cached.element;
      cached.params = params;
      if (!options.reuseParams && el?.setAttribute && el.hasAttribute('data') && typeof encodeData === 'function') {
        try { el.setAttribute('data', encodeData(params)); } catch (_) {}
      }
      return el;
    }

    const slot = document.createElement('div');
    slot.setAttribute('data-sw-screen', cacheKey);
    slot.setAttribute('role', 'group');
    this._styleScreenSlot(slot);
    slot.innerHTML = typeof screenContent === 'string' ? screenContent : '';

    const screenElement = slot.firstElementChild || slot;
    if (screenElement !== slot) {
      screenElement.setAttribute('data-route-key', cacheKey);
    }

    const entry = { slot, element: screenElement, params, scrollTop: 0 };
    this._screenCache.set(cacheKey, entry);
    container.appendChild(slot);
    this._showScreenSlot(slot, entry);
    return screenElement;
  }

  renderScreen(fullRoute, additionalProps = {}) {
    const normalized = fullRoute.startsWith('/') ? fullRoute.substring(1) : fullRoute;
    const [routeName, ...dynamicSegments] = normalized.split('/');
    const dynamicParams = {};

    if (dynamicSegments.length > 0) {
      const routePattern = Object.keys(this.routes).find((pattern) =>
        pattern.startsWith(routeName) && pattern.includes(':')
      );

      if (routePattern) {
        const patternSegments = routePattern.split('/');
        patternSegments.forEach((segment, index) => {
          if (segment.startsWith(':')) {
            const paramName = segment.slice(1);
            dynamicParams[paramName] = dynamicSegments[index - 1];
          }
        });
      }
    }

    const params = { ...additionalProps, ...dynamicParams };
    const route = this.findRoute(normalized, params);
    if (!route) return null;

    const resolvedKey = route._matchedKey || normalized;
    const effectiveParams = route._resolvedParams || params;
    const fullPath = this.buildPath(route, effectiveParams);
    const normalizedRoute = route._useNormalized ? normalized : resolvedKey;
    const routeInfo = { normalizedRoute, route, fullPath, params: effectiveParams };
    const containerFromCallback = typeof this.onRouteChange === 'function' ? this.onRouteChange(routeInfo) : null;
    const container = containerFromCallback || this.containerEl;
    const screenContent = typeof route.render === 'function' ? route.render(effectiveParams) : route.render;

    if (this.updateTitleCallback) this.updateTitleCallback(normalized);
    const cacheKey = route.cacheKey || normalizedRoute;
    // cacheKey reuses one instance across param changes (e.g. /home and /home/Travel).
    if (container) this._showScreen(container, cacheKey, screenContent, effectiveParams, { reuseParams: !!route.cacheKey });
    const baseTitle = route.title || '';
    document.title = this.titlePrefix ? (baseTitle ? `${this.titlePrefix} - ${baseTitle}` : this.titlePrefix) : baseTitle;

    return routeInfo;
  }

  navigate(fullRoute, additionalProps = {}) {
    const normalized = fullRoute.startsWith('/') ? fullRoute.substring(1) : fullRoute;
    const route = this.findRoute(normalized, additionalProps);
    if (!route) return this.renderNotFound(normalized, additionalProps);

    if (this._lockedRoute && normalized !== this._lockedRoute) {
      this._lockedRoute = null;
    }

    const inferredParams = this.extractParamsFromRoute(normalized, route);
    const nextParams = { ...inferredParams, ...additionalProps };
    const fullPath = this.buildPath(route, nextParams);
    if (String(fullPath).includes(':')) return null;
    history.pushState({ route: normalized, params: nextParams }, '', fullPath);

    return this.renderScreen(normalized, nextParams);
  }

  redirect(fullRoute, additionalProps = {}) {
    return this.navigate(fullRoute, additionalProps);
  }

  replace(fullRoute, additionalProps = {}) {
    const normalized = fullRoute.startsWith('/') ? fullRoute.substring(1) : fullRoute;
    const route = this.findRoute(normalized, additionalProps);
    if (!route) return this.renderNotFound(normalized, additionalProps);

    const inferredParams = this.extractParamsFromRoute(normalized, route);
    const nextParams = { ...inferredParams, ...additionalProps };

    const urlOverride = nextParams && typeof nextParams.__url === 'string' ? nextParams.__url : null;
    if (urlOverride) delete nextParams.__url;

    const fullPath = urlOverride || this.buildPath(route, nextParams);
    if (String(fullPath).includes(':')) return null;

    const lockHistory = !!(nextParams && nextParams.__lockHistory);
    if (lockHistory) {
      delete nextParams.__lockHistory;
      this._lockedRoute = normalized;
    } else if (this._lockedRoute && normalized !== this._lockedRoute) {
      this._lockedRoute = null;
    }

    history.replaceState({ route: normalized, params: nextParams }, '', fullPath);
    return this.renderScreen(normalized, nextParams);
  }

  handlePopState(event) {
    if (this._lockedRoute) {
      const currentPath = window.location.pathname || '/';
      const currentRouting = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
      const lockedRouting = this._lockedRoute;

      if (currentRouting !== lockedRouting) {
        return this.replace(lockedRouting, { __url: '/', __lockHistory: true });
      }
    }

    const fullPath = window.location.pathname;
    const routingPath = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
    if (routingPath) {
      const info = this.renderScreen(routingPath, (event.state && event.state.params) ? event.state.params : {});
      if (!info) return this.renderNotFound(routingPath, {});
      return info;
    }
    const targetRoute = this.defaultRoute;
    if (targetRoute) return this.navigate(targetRoute, {});
    return this.renderNotFound('', {});
  }

  go_back() {
    window.history.back();
  }

  /**
   * Clear the screen cache. Useful for forcing a fresh render of all screens.
   * @param {string} [cacheKey] - Optional specific cache key to clear. If omitted, clears all.
   */
  clearScreenCache(cacheKey) {
    if (cacheKey) {
      const cached = this._screenCache.get(cacheKey);
      cached?.slot?.remove();
      this._screenCache.delete(cacheKey);
    } else {
      this._screenCache.forEach((cached) => cached.slot?.remove());
      this._screenCache.clear();
    }
  }
}
