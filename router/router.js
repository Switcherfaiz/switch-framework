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
        if (container) container.innerHTML = screenContent;
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
    const safePath = this.escapeHtml(missingPath);
    const fallbackRoute = this.defaultRoute ? ` fallback-route="${this.escapeHtml(this.defaultRoute)}"` : '';
    if (container) container.innerHTML = `<sw-not-found-screen path="${safePath}"${fallbackRoute}></sw-not-found-screen>`;
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
      if (seg.startsWith(':')) acc[seg.slice(1)] = routeSegments[idx];
      return acc;
    }, {});
  }

  findRoute(routeName, params = {}) {
    const normalized = routeName.startsWith('/') ? routeName.substring(1) : routeName;
    
    // First check for exact static match
    if (this.routes[normalized]) {
      const route = this.routes[normalized];
      const pathTemplate = route.path || '';
      // If route path has required params (:param) and normalized has fewer segments, don't match
      // e.g. /docs with no param should not match route "docs" with path /docs/:id
      if (pathTemplate.includes(':')) {
        const pathSegments = pathTemplate.replace(/^\//, '').split('/');
        const routeSegments = normalized.split('/');
        if (routeSegments.length < pathSegments.length) {
          // Fall through to dynamic/not-found - don't match incomplete path
        } else {
          return { ...route, render: () => route.render(params) };
        }
      } else {
        return { ...route, render: () => route.render(params) };
      }
    }

    // Then check for dynamic routes - match by path template when path contains :
    const dynamicRoutes = Object.entries(this.routes).filter(
      ([, route]) => (route.path || '').includes(':')
    );

    dynamicRoutes.sort(([, routeA], [, routeB]) => {
      const aDynamicCount = (routeA.path || '').split(':').length - 1;
      const bDynamicCount = (routeB.path || '').split(':').length - 1;
      return aDynamicCount - bDynamicCount;
    });

    for (const [routeKey, route] of dynamicRoutes) {
      const pathTemplate = route.path || '/' + routeKey;
      const patternSegments = pathTemplate.replace(/^\//, '').split('/');
      const routeSegments = normalized.split('/');
      if (patternSegments.length !== routeSegments.length) continue;

      const dynamicParams = {};
      let isMatch = true;

      for (let i = 0; i < patternSegments.length; i++) {
        const patternSegment = patternSegments[i];
        const routeSegment = routeSegments[i];
        if (patternSegment.startsWith(':')) {
          dynamicParams[patternSegment.slice(1)] = routeSegment;
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

    // Fallback: try matching a parent prefix route (e.g. "docs/router" -> "docs")
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
    let path = route.path;
    Object.entries(params || {}).forEach(([key, value]) => {
      path = path.replace(`:${key}`, value);
    });
    return path.startsWith('/') ? path : '/' + path;
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
    if (container) container.innerHTML = screenContent;
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
}
