import {
  createGlobalStates,
  Router,
  encodeData,
  decodeData
} from '../router/index.js';

export class TwAppInitial extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.globalStates = createGlobalStates();
    this.router = null;
    this.layout = null;
    this._ready = false;
    this._preventAutoHideSplash = false;
    this._splashRemoved = false;
  }

  connectedCallback() {
    this.renderSplash();
  }

  initialize(layout) {
    this.layout = layout;
    this.boot();
  }

  async boot() {
    if (this._ready) return;
    this._ready = true;

    globalThis.globalStates = this.globalStates;

    const initialSplashTag = this.layout?.splash || 'sw-splash-screen';
    this.renderSplash(initialSplashTag);

    const api = {
      globalStates: this.globalStates,
      router: null,
      encodeData,
      decodeData,
      renderSplashscreen: (tag) => this.renderSplash(tag),
      removeSplash: () => this.removeSplash(),
      removeSplashscreen: () => this.removeSplashscreen(),
      preventAutoHideSplashScreen: () => this.preventAutoHideSplashScreen(),
      mountApp: () => this.mountApp()
    };

    document.dispatchEvent(new CustomEvent('app:booting', { bubbles: true }));

    const layoutResult = await (this.layout?.init ? this.layout.init(api) : Promise.resolve({}));

    const buildRoutesFromScreens = (screensList = []) => {
      return (screensList || []).reduce((acc, screen) => {
        if (!screen?.name) return acc;
        const key = screen.name;
        const path = screen.path || ('/' + key);
        const title = screen.title || key;
        const tag = screen.tag;
        const layout = screen.layout || 'stack';

        acc[key] = {
          path,
          title,
          layout,
          render: (props = {}) => {
            if (typeof screen.render === 'function') return screen.render(props, api);
            if (!tag) return '';
            if (screen.props === 'encoded') {
              return `<${tag} data="${encodeData(props)}"></${tag}>`;
            }
            return `<${tag}></${tag}>`;
          }
        };

        return acc;
      }, {});
    };

    const routes = layoutResult?.routes || this.layout?.routes || buildRoutesFromScreens(layoutResult?.screens || this.layout?.screens) || {};
    const routeKeys = Object.keys(routes);
    const initialRoute = layoutResult?.initialRoute || this.layout?.initialRoute || (routeKeys.length ? routeKeys[0] : null);
    const titlePrefix = layoutResult?.titlePrefix ?? this.layout?.titlePrefix ?? this.layout?.appName ?? '';

    if (!this._preventAutoHideSplash && !this._splashRemoved) {
      this.removeSplashscreen();
    }

    await (this.layout?.beforeMount ? this.layout.beforeMount(api) : Promise.resolve());

    this.mountApp();

    const appShell = this.shadowRoot.querySelector('sw-app-shell');
    const appContainer = appShell?.getContentContainer ? appShell.getContentContainer() : null;

    this.router = new Router(
      routes,
      null,
      appContainer,
      (routeInfo) => {
        const layoutType = routeInfo?.route?.layout || 'stack';
        const params = routeInfo?.params || {};
        const routeParams = Object.fromEntries(
          Object.entries(params).filter(([k]) => !k.startsWith('_') && !k.startsWith('__'))
        );
        const searchParams = Object.fromEntries(new URLSearchParams(window.location.search || ''));
        this.globalStates.setState({
          activePath: routeInfo.fullPath,
          activeRoute: routeInfo.normalizedRoute,
          activeLayout: layoutType,
          routeParams,
          searchParams
        });
        document.dispatchEvent(new CustomEvent('router:change', { bubbles: true, detail: routeInfo }));

        const currentShell = this.shadowRoot.querySelector('sw-app-shell');
        if (currentShell?.setLayout) currentShell.setLayout(layoutType);

        if (layoutType === 'tabs') {
          return currentShell?.getTabsContainer ? currentShell.getTabsContainer() : null;
        }

        return currentShell?.getStackContainer ? currentShell.getStackContainer() : null;
      },
      { defaultRoute: initialRoute, titlePrefix }
    );

    api.router = this.router;

    this.globalStates.setState({ navigate: this.router.navigate, redirect: this.router.redirect, replace: this.router.replace, go_back: this.router.go_back, defaultRoute: initialRoute });

    document.addEventListener('router:back', () => this.router?.go_back());

    this.router.start(initialRoute);

    document.dispatchEvent(new CustomEvent('app:ready', { bubbles: true, detail: { globalStates: this.globalStates } }));
  }

  renderSplash(tagName) {
    const resolved = typeof tagName === 'string' ? tagName : '';
    const innerComponent = resolved && resolved !== 'sw-splash-screen' ? resolved : '';

    this.shadowRoot.innerHTML = `
      ${this.styleSheet()}
      <sw-splash-screen ${innerComponent ? `component="${innerComponent}"` : ''}></sw-splash-screen>
    `;
  }

  removeSplash() {
    this.shadowRoot.innerHTML = `${this.styleSheet()}`;
  }

  removeSplashscreen() {
    this._splashRemoved = true;
    this.mountApp();
  }

  preventAutoHideSplashScreen() {
    this._preventAutoHideSplash = true;
  }

  mountApp() {
    this.shadowRoot.innerHTML = `
      ${this.styleSheet()}
      <sw-app-shell></sw-app-shell>
    `;
  }

  styleSheet() {
    return `
      <style>
        :host{position:absolute;inset:0;display:flex;flex-direction:column;width:100%;height:100dvh;overflow:auto;overflow-x:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;font-family:inherit}
        *{box-sizing:border-box;font-family:inherit;padding:0;margin:0}
      </style>
    `;
  }
}
