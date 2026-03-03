export class SwRedirect extends HTMLElement {
  static get observedAttributes() {
    return ['href', 'mode'];
  }

  attributeChangedCallback() {
    // no-op; we only act on first mount to avoid loops
  }

  connectedCallback() {
    const href = this.getAttribute('href') || '';
    const mode = (this.getAttribute('mode') || 'redirect').toLowerCase();

    const redirect = globalStates?.getState ? globalStates.getState('redirect') : null;
    const replace = globalStates?.getState ? globalStates.getState('replace') : null;
    const navigate = globalStates?.getState ? globalStates.getState('navigate') : null;

    const routeName = href.startsWith('/') ? href.substring(1) : href;

    if (mode === 'replace' && typeof replace === 'function') {
      replace(routeName);
      return;
    }

    if (typeof redirect === 'function') {
      redirect(routeName);
      return;
    }

    if (typeof navigate === 'function') {
      navigate(routeName);
      return;
    }
  }
}

if (!customElements.get('sw-redirect')) {
  customElements.define('sw-redirect', SwRedirect);
}
