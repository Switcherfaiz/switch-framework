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
    const keys = Object.keys(this.routes);
    const candidates = ['+not-found', 'not-found', '404'];
    return candidates.find((k) => keys.includes(k)) || null;
  }

  renderNotFound(missingRoute = '', additionalProps = {}) {
    const missingPath = window.location.pathname || '';
    const notFoundKey = this.getNotFoundRouteKey();

    if (notFoundKey && missingRoute !== notFoundKey) {
      return this.redirect(notFoundKey, { ...additionalProps, missingRoute, missingPath });
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
      return { ...this.routes[normalized], render: () => this.routes[normalized].render(params) };
    }

    // Then check for dynamic routes, but prioritize more specific patterns
    const dynamicRoutes = Object.entries(this.routes).filter(([pattern]) => pattern.includes(':'));
    
    // Sort by specificity - fewer dynamic segments = more specific
    dynamicRoutes.sort(([, routeA], [, routeB]) => {
      const aDynamicCount = (routeA.path || '').split(':').length - 1;
      const bDynamicCount = (routeB.path || '').split(':').length - 1;
      return aDynamicCount - bDynamicCount;
    });

    for (const [routePattern, route] of dynamicRoutes) {
      const patternSegments = routePattern.split('/');
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
        return { ...route, render: () => route.render({ ...params, ...dynamicParams }) };
      }
    }

    // Fallback: try matching a parent prefix route (e.g. "docs/router" -> "docs")
    const segments = normalized.split('/');
    if (segments.length > 1) {
      for (let i = segments.length - 1; i >= 1; i--) {
        const prefix = segments.slice(0, i).join('/');
        if (this.routes[prefix]) {
          const subPath = segments.slice(i).join('/');
          return { ...this.routes[prefix], _matchedKey: prefix, render: () => this.routes[prefix].render({ ...params, _subPath: subPath }) };
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
    const fullPath = this.buildPath(route, params);
    const routeInfo = { normalizedRoute: resolvedKey, route, fullPath, params };
    const containerFromCallback = typeof this.onRouteChange === 'function' ? this.onRouteChange(routeInfo) : null;
    const container = containerFromCallback || this.containerEl;
    const screenContent = typeof route.render === 'function' ? route.render(params) : route.render;

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
