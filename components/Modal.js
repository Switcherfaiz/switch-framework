import { SwitchComponent } from '../registers/SwitchComponent.js';
import { bindStaticRefs, bindInstanceRefs } from '../state-managers/index.js';
import { resolveBinding, ensureBinding } from './listBindings.js';
import { updateState, subscribeState, getState } from '../state-managers/index.js';
import { adoptModal, syncPopupsPointerEvents, armModalBack, disarmModalBack } from './modalPortal.js';

const MODAL_SCOPE = 'modal';

function isOn(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'open' in value) {
    return isOn(value.open);
  }
  return value === true || value === 'true' || value === 1 || value === '1';
}

function closeVisibleValue(current) {
  if (current && typeof current === 'object' && !Array.isArray(current) && 'open' in current) {
    return { ...current, open: false };
  }
  return false;
}

function openVisibleValue(current) {
  if (current && typeof current === 'object' && !Array.isArray(current) && 'open' in current) {
    return { ...current, open: true };
  }
  return true;
}

/**
 * Modal – React Native-inspired overlay.
 *
 * Subclass `render()` is the panel. `onMount` / `onUpdate` / `onDestroy` on
 * Modal always run (SwitchComponent walks the prototype chain — no super).
 * The host is lifted into the app `.popups` layer so it paints on top.
 */
export class Modal extends SwitchComponent {
  static tag = 'sw-modal';

  static visible = false;
  static transparent = true;
  static animationType = 'fade';
  static presentationStyle = 'overFullScreen';
  static statusBarTranslucent = true;

  static interceptBack = true;
  static interceptBackState = '';

  static visibleState = '';
  static transparentState = '';
  static animationTypeState = '';
  static presentationStyleState = '';

  static processStyleSheet(css) {
    return String(css).replace(
      new RegExp(`(?<![\\w.-])${MODAL_SCOPE}(?=::|[\\s.#\\[,>+~])`, 'gi'),
      `.${MODAL_SCOPE}`
    );
  }

  constructor() {
    super();
    this._wasVisible = false;
    this._onKeyDown = (e) => {
      if (e.key === 'Escape' && this._isVisible()) {
        e.preventDefault();
        this.onRequestClose();
      }
    };
  }

  _binding(name, fallback) {
    return resolveBinding(this, name, fallback);
  }

  _read(name, fallback) {
    return this._binding(name, fallback).value;
  }

  _isVisible() {
    return isOn(this._read('visible', this.constructor.visible ?? false));
  }

  _animationType() {
    const value = String(this._read('animationType', this.constructor.animationType || 'fade') || 'fade');
    return ['fade', 'slide', 'none'].includes(value) ? value : 'fade';
  }

  _presentationStyle() {
    const value = String(this._read('presentationStyle', this.constructor.presentationStyle || 'overFullScreen') || 'overFullScreen');
    if (['overFullScreen', 'pageSheet', 'formSheet', 'centered'].includes(value)) return value;
    return 'overFullScreen';
  }

  _isTransparent() {
    return this._read('transparent', this.constructor.transparent !== false) !== false;
  }

  _interceptBack() {
    const value = this._read('interceptBack', this.constructor.interceptBack !== false);
    return value !== false && value !== 'false' && value !== 0;
  }

  onRequestClose() {
    const binding = this._binding('visible', false);
    if (binding.mode === 'state' && binding.key) {
      try {
        updateState(binding.key, (cur) => closeVisibleValue(cur ?? getState(binding.key)));
      } catch (_) {}
    }
  }

  present() {
    const binding = this._binding('visible', false);
    if (binding.mode === 'state' && binding.key) {
      try {
        updateState(binding.key, (cur) => openVisibleValue(cur ?? getState(binding.key)));
      } catch (_) {}
    }
  }

  dismiss() {
    this.onRequestClose();
  }

  wrapRender(panelHtml = '') {
    const visible = this._isVisible();
    const animation = this._animationType();
    const presentation = this._presentationStyle();
    return `
      <div
        data-modal-root
        class="modal modal-root animation-${animation} presentation-${presentation} ${visible ? 'is-visible' : ''}"
        aria-hidden="${visible ? 'false' : 'true'}"
        role="dialog"
        aria-modal="true"
      >
        <div data-modal-backdrop class="modal-backdrop ${this._isTransparent() ? 'is-transparent' : ''}"></div>
        <div class="modal-container">${panelHtml}</div>
      </div>
    `;
  }

  _syncVisibleDOM() {
    const visible = this._isVisible();
    const root = this.select('[data-modal-root]');
    const backdrop = this.select('[data-modal-backdrop]');
    if (root) {
      root.classList.toggle('is-visible', visible);
      root.setAttribute('aria-hidden', visible ? 'false' : 'true');
      root.classList.toggle('animation-fade', this._animationType() === 'fade');
      root.classList.toggle('animation-slide', this._animationType() === 'slide');
      root.classList.toggle('animation-none', this._animationType() === 'none');
      ['overFullScreen', 'pageSheet', 'formSheet', 'centered'].forEach((name) => {
        root.classList.toggle(`presentation-${name}`, this._presentationStyle() === name);
      });
    }
    if (backdrop) backdrop.classList.toggle('is-transparent', !this._isTransparent());

    this.style.pointerEvents = visible ? 'auto' : 'none';
    this.classList.toggle('is-open', visible);
    syncPopupsPointerEvents(this, visible);

    if (visible && this._interceptBack()) armModalBack(this);
    else disarmModalBack(this);

    if (visible && !this._wasVisible) {
      document.addEventListener('keydown', this._onKeyDown);
      requestAnimationFrame(() => this.select('[data-modal-autofocus], button, input, textarea, [tabindex]:not([tabindex="-1"])')?.focus?.());
    }
    if (!visible && this._wasVisible) {
      document.removeEventListener('keydown', this._onKeyDown);
    }
    this._wasVisible = visible;
  }

  _watchKeys() {
    ['visible', 'animationType', 'presentationStyle', 'transparent', 'interceptBack'].forEach((name) => {
      const binding = this._binding(name, name === 'visible' ? false : undefined);
      if (binding.mode !== 'state' || !binding.key) return;
      if (name === 'visible') ensureBinding(binding, false);
      const unsub = subscribeState(binding.key, () => this.rerender(), { immediate: false });
      this.addOnDestroy(unsub);
    });
  }

  onMount() {
    this._watchKeys();
    bindStaticRefs(this);
    bindInstanceRefs(this);
    this.listener('[data-modal-backdrop]', 'click', (e) => {
      if (e.target?.closest?.('[data-modal-backdrop]') === e.target) this.onRequestClose();
    });
    this._syncVisibleDOM();
    this.addOnDestroy(() => {
      document.removeEventListener('keydown', this._onKeyDown);
      disarmModalBack(this);
    });
    queueMicrotask(() => {
      const kept = adoptModal(this);
      if (kept && kept !== this) this.remove();
    });
  }

  onUpdate() {
    bindStaticRefs(this);
    bindInstanceRefs(this);
    this._syncVisibleDOM();
  }

  onDestroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    disarmModalBack(this);
  }

  styleSheet() {
    return `
      <style>
        :host {
          display: block;
          position: fixed;
          inset: 0;
          z-index: 10000;
          pointer-events: none;
        }
        :host(.is-open) { pointer-events: auto; }

        .modal-root {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 0.2s ease, visibility 0.2s ease;
        }
        .modal-root.is-visible {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }
        .modal-root.presentation-pageSheet,
        .modal-root.presentation-formSheet {
          align-items: flex-end;
        }

        .modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(9, 9, 11, 0.45);
          backdrop-filter: blur(8px);
        }
        .modal-backdrop.is-transparent { background: transparent; backdrop-filter: none; }

        .modal-container {
          position: relative;
          z-index: 1;
          width: 100%;
          max-height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-root.presentation-overFullScreen .modal-container,
        .modal-root.presentation-centered .modal-container {
          padding: 12vh 16px 16px;
          max-width: 640px;
        }

        .modal-root.presentation-pageSheet .modal-container {
          align-items: flex-end;
          justify-content: stretch;
          padding: 0;
          width: 100%;
          max-width: none;
        }
        .modal-root.presentation-pageSheet .modal-container > :last-child {
          width: 100%;
          max-height: 92vh;
          border-radius: 20px 20px 0 0;
        }

        .modal-root.presentation-formSheet .modal-container {
          align-items: flex-end;
          padding: 0 12px 12px;
          width: 100%;
        }
        .modal-root.presentation-formSheet .modal-container > * {
          width: 100%;
          max-width: 640px;
          max-height: 80vh;
          border-radius: 20px;
          overflow: hidden;
        }

        .modal-root.animation-slide .modal-container {
          transform: translateY(24px);
          transition: transform 0.24s ease;
        }
        .modal-root.animation-slide.is-visible .modal-container {
          transform: translateY(0);
        }
        .modal-root.animation-none,
        .modal-root.animation-none .modal-container {
          transition: none;
        }
      </style>
    `;
  }
}

export default Modal;
