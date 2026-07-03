import { SwitchComponent } from '../registers/SwitchComponent.js';
import { getState, subscribeState, createState, bindInstanceRefs } from '../state-managers/index.js';

/**
 * FlatList – React Native-inspired list component for Switch Framework
 *
 * Base setup runs automatically (no super.onMount()). Extend, add static useState for
 * state keys, use useRef(this) in onMount for scroll APIs, getState in render/renderItem.
 */

const FLATLIST_SCOPE = 'flatlist';
const _flatListStatesRegistered = new WeakSet();

export class FlatList extends SwitchComponent {
  static tag = 'sw-flat-list';

  static numColumns = 1;
  static horizontal = false;
  static initialNumToRender = 10;
  static maxToRenderPerBatch = 10;
  static windowSize = 21;
  static onEndReachedThreshold = 0.5;
  static trackVisibleItems = false;
  static showsVerticalScrollIndicator = true;
  static showsHorizontalScrollIndicator = true;
  /** Horizontal row item width, e.g. `'100%'` (carousel) or `'148px'`. Applied to item wrappers. */
  static horizontalItemWidth = '';

  /** Override default `${tag}-data` state key for this list's items */
  static dataState = '';
  /** State key — FlatList reads `getState(horizontalState)` on each render */
  static horizontalState = '';
  /** State key — FlatList reads `getState(numColumnsState)` on each render */
  static numColumnsState = '';
  static loadingState = '';
  static refreshingState = '';
  static errorState = '';
  static scrollToEndActionKey = '';
  static scrollToIndexActionKey = '';
  static flashScrollActionKey = '';

  /** Creates default data, status, and scroll action states for a list class. */
  static registerStates(Cls) {
    if (!Cls?.tag || _flatListStatesRegistered.has(Cls)) return;
    _flatListStatesRegistered.add(Cls);

    const prefix = Cls.tag;
    if (!Cls.dataState) Cls.dataState = `${prefix}-data`;
    if (!Cls.loadingState) Cls.loadingState = `${prefix}-loading`;
    if (!Cls.refreshingState) Cls.refreshingState = `${prefix}-refreshing`;
    if (!Cls.errorState) Cls.errorState = `${prefix}-error`;

    Cls.scrollToEndActionKey = `${prefix}-action-scroll-end`;
    Cls.scrollToIndexActionKey = `${prefix}-action-scroll-index`;
    Cls.flashScrollActionKey = `${prefix}-action-flash-scroll`;

    const ensure = (key, initial) => {
      try {
        createState(key, initial);
      } catch (_) {}
    };

    ensure(Cls.dataState, []);
    ensure(Cls.loadingState, false);
    ensure(Cls.refreshingState, false);
    ensure(Cls.errorState, null);
    ensure(Cls.scrollToEndActionKey, 0);
    ensure(Cls.scrollToIndexActionKey, null);
    ensure(Cls.flashScrollActionKey, 0);
  }

  static {
    FlatList.registerStates(FlatList);
    FlatList.useState('sw-flat-list-data');
  }

  /** Rewrites `flatlist::…` / `flatlist .class` to `.flatlist…` in extended styleSheets */
  static processStyleSheet(css) {
    return String(css).replace(
      new RegExp(`(?<![\\w.-])${FLATLIST_SCOPE}(?=::|[\\s.#\\[,>+~])`, 'gi'),
      `.${FLATLIST_SCOPE}`
    );
  }

  constructor() {
    super();

    this._containerRef = null;
    this._itemsRef = new Map();
    this._scrollPositionRef = { x: 0, y: 0 };
    this._isNearEndRef = false;
    this._visibleItemsRef = new Set();
    this._renderedItems = [];
    this._isMounted = false;
    this._visibleUpdateRaf = null;
    this._flatListInit = false;
  }

  connectedCallback() {
    this.constructor.registerStates(this.constructor);
    if (!this._flatListInit) {
      this._flatListInit = true;
      this._subscribeToStates();
      this._watchScrollActionStates();
    }
    super.connectedCallback();
  }

  _runRenderAndMount() {
    SwitchComponent.prototype._runRenderAndMount.call(this);
    bindInstanceRefs(this);
    this._bindListDom();
  }

  _bindListDom() {
    this._isMounted = true;
    this._containerRef = this.select('.flat-list-container');

    if (this._containerRef) {
      this._containerRef.addEventListener('scroll', (e) => this.onScroll(e));
    }

    const items = this.selectAll('.flat-list-item-wrapper');
    this._itemsRef.clear();
    items.forEach((item) => {
      const key = item.dataset.key;
      if (key) this._itemsRef.set(key, item);
    });

    this._syncHorizontalSlideWidths();
    requestAnimationFrame(() => this._syncHorizontalSlideWidths());

    if (this._isHorizontal() && this.constructor.horizontalItemWidth === '100%' && this._containerRef && typeof ResizeObserver !== 'undefined') {
      if (!this._resizeOb) {
        this._resizeOb = new ResizeObserver(() => this._syncHorizontalSlideWidths());
        this._resizeOb.observe(this._containerRef);
        this.addOnDestroy(() => {
          this._resizeOb?.disconnect();
          this._resizeOb = null;
        });
      }
    }
  }

  renderItem({ item, index, separators }) {
    return `<div class="flat-list-item" data-index="${index}">${JSON.stringify(item)}</div>`;
  }

  keyExtractor(item, index) {
    return item?.id ?? item?.key ?? `item-${index}`;
  }

  renderLoader() {
    return `
      <div class="flat-list-loader">
        <div class="loader-track">
          <div class="loader-bar"></div>
        </div>
      </div>
    `;
  }

  renderEmpty() {
    return `<div class="flat-list-empty">No items</div>`;
  }

  renderHeader() {
    return '';
  }

  renderFooter() {
    return '';
  }

  renderSeparator() {
    return '<div class="flat-list-separator"></div>';
  }

  renderError() {
    return `<div class="flat-list-error">Error loading data</div>`;
  }

  getItemLayout(data, index) {
    return null;
  }

  onEndReached() {
    console.log('[FlatList] onEndReached');
  }

  onRefresh() {
    console.log('[FlatList] onRefresh');
  }

  onScroll(event) {
    this._handleScroll(event);
  }

  _handleScroll(event) {
    const container = event.target;
    const { scrollTop, scrollLeft, scrollHeight, clientHeight, scrollWidth, clientWidth } = container;

    this._scrollPositionRef = { x: scrollLeft, y: scrollTop };

    const isHorizontal = this._isHorizontal();
    const threshold = this._readConfig('onEndReachedThreshold', 0.5);

    if (!isHorizontal) {
      const thresholdPixels = threshold * clientHeight;
      const isNearEnd = scrollTop + clientHeight >= scrollHeight - thresholdPixels;

      if (isNearEnd && !this._isNearEndRef) {
        this._isNearEndRef = true;
        this.onEndReached();
      } else if (!isNearEnd) {
        this._isNearEndRef = false;
      }
    } else {
      const thresholdPixels = threshold * clientWidth;
      const isNearEnd = scrollLeft + clientWidth >= scrollWidth - thresholdPixels;

      if (isNearEnd && !this._isNearEndRef) {
        this._isNearEndRef = true;
        this.onEndReached();
      } else if (!isNearEnd) {
        this._isNearEndRef = false;
      }
    }

    if (this.constructor.trackVisibleItems) this._scheduleVisibleItemsUpdate();
  }

  _scheduleVisibleItemsUpdate() {
    if (!this._containerRef) return;
    if (this._visibleUpdateRaf) return;

    this._visibleUpdateRaf = requestAnimationFrame(() => {
      this._visibleUpdateRaf = null;
      this._updateVisibleItems();
    });
  }

  _updateVisibleItems() {
    if (!this._containerRef) return;

    const containerRect = this._containerRef.getBoundingClientRect();
    const newVisibleItems = new Set();

    for (const [key, element] of this._itemsRef) {
      const rect = element.getBoundingClientRect();
      const isVisible = !(rect.bottom < containerRect.top || rect.top > containerRect.bottom);

      if (isVisible) newVisibleItems.add(key);
    }

    this._visibleItemsRef = newVisibleItems;
  }

  _getStateKeys() {
    const tag = this.constructor.tag || 'flat-list';
    const defaults = {
      data: `${tag}-data`,
      loading: `${tag}-loading`,
      refreshing: `${tag}-refreshing`,
      error: `${tag}-error`
    };
    const Cls = this.constructor;
    return {
      data: Cls.dataState || defaults.data,
      loading: Cls.loadingState || defaults.loading,
      refreshing: Cls.refreshingState || defaults.refreshing,
      error: Cls.errorState || defaults.error
    };
  }

  _readConfig(prop, fallback) {
    const Cls = this.constructor;
    const stateKey = Cls[`${prop}State`];
    if (stateKey && typeof stateKey === 'string') {
      try {
        const val = getState(stateKey);
        if (val !== undefined && val !== null) return val;
      } catch (_) {}
    }
    const direct = Cls[prop];
    return direct !== undefined && direct !== null ? direct : fallback;
  }

  _isHorizontal() {
    return !!this._readConfig('horizontal', false);
  }

  _getNumColumns() {
    const n = this._readConfig('numColumns', 1);
    return Number(n) || 1;
  }

  _showsVerticalScrollIndicator() {
    return !!this._readConfig('showsVerticalScrollIndicator', true);
  }

  _showsHorizontalScrollIndicator() {
    return !!this._readConfig('showsHorizontalScrollIndicator', true);
  }

  _getScrollIndicatorClasses(horizontal) {
    const classes = [];
    if (!horizontal && !this._showsVerticalScrollIndicator()) classes.push('hide-scroll-v');
    if (horizontal && !this._showsHorizontalScrollIndicator()) classes.push('hide-scroll-h');
    return classes;
  }

  scrollToIndex({ index, animated = true, viewOffset = 0, viewPosition } = {}) {
    const itemKey = this._renderedItems[index];
    if (!itemKey || !this._containerRef) return;

    const element = this._itemsRef.get(itemKey);
    if (!element) return;

    const horizontal = this._isHorizontal();
    const container = this._containerRef;

    if (viewPosition !== undefined && viewPosition !== null) {
      const itemRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (horizontal) {
        const itemStart = itemRect.left - containerRect.left + container.scrollLeft;
        const target = itemStart - (container.clientWidth * viewPosition) + viewOffset;
        container.scrollTo({ left: target, behavior: animated ? 'smooth' : 'auto' });
      } else {
        const itemStart = itemRect.top - containerRect.top + container.scrollTop;
        const target = itemStart - (container.clientHeight * viewPosition) + viewOffset;
        container.scrollTo({ top: target, behavior: animated ? 'smooth' : 'auto' });
      }
      return;
    }

    element.scrollIntoView({
      behavior: animated ? 'smooth' : 'auto',
      block: horizontal ? 'nearest' : 'start',
      inline: horizontal ? 'start' : 'nearest'
    });
  }

  scrollToEnd({ animated = true } = {}) {
    if (!this._containerRef) return;
    const container = this._containerRef;
    const isHorizontal = this._isHorizontal();

    container.scrollTo({
      [isHorizontal ? 'left' : 'top']: isHorizontal
        ? container.scrollWidth - container.clientWidth
        : container.scrollHeight - container.clientHeight,
      behavior: animated ? 'smooth' : 'auto'
    });
  }

  scrollToOffset({ offset, animated = true }) {
    if (!this._containerRef) return;
    const isHorizontal = this._isHorizontal();

    this._containerRef.scrollTo({
      [isHorizontal ? 'left' : 'top']: offset,
      behavior: animated ? 'smooth' : 'auto'
    });
  }

  scrollBy({ x = 0, y = 0, animated = true } = {}) {
    if (!this._containerRef) return;
    this._containerRef.scrollBy({
      left: x,
      top: y,
      behavior: animated ? 'smooth' : 'auto'
    });
  }

  recordInteraction() {}

  flashScrollIndicators() {
    if (this._containerRef) {
      this._containerRef.style.scrollbarColor = 'var(--primary) transparent';
      setTimeout(() => {
        if (this._containerRef) this._containerRef.style.scrollbarColor = '';
      }, 300);
    }
  }

  _watchScrollActionStates() {
    const C = this.constructor;

    const watchCounter = (key, run) => {
      if (!key) return;
      try {
        let prev = getState(key);
        const unsub = subscribeState(key, (val) => {
          if (Object.is(val, prev)) return;
          prev = val;
          run(val);
        }, { immediate: false });
        this._stateUnsubs.push(unsub);
      } catch (_) {}
    };

    watchCounter(C.scrollToEndActionKey, () => this.scrollToEnd({ animated: true }));

    watchCounter(C.flashScrollActionKey, () => this.flashScrollIndicators());

    if (C.scrollToIndexActionKey) {
      try {
        let prev = getState(C.scrollToIndexActionKey);
        const unsub = subscribeState(C.scrollToIndexActionKey, (val) => {
          if (val == null || Object.is(val, prev)) return;
          prev = val;
          if (typeof val === 'object') this.scrollToIndex(val);
        }, { immediate: false });
        this._stateUnsubs.push(unsub);
      } catch (_) {}
    }
  }

  _syncHorizontalSlideWidths() {
    if (!this._isHorizontal() || !this._containerRef) return;

    const widthMode = this.constructor.horizontalItemWidth;
    const container = this._containerRef;
    const viewport = container.clientWidth;
    if (!viewport) return;

    if (widthMode === '100%') {
      container.style.scrollSnapType = 'x mandatory';
      this.selectAll('.flat-list-item-wrapper').forEach((el) => {
        el.style.flex = `0 0 ${viewport}px`;
        el.style.width = `${viewport}px`;
        el.style.maxWidth = `${viewport}px`;
        el.style.scrollSnapAlign = 'start';
      });
      return;
    }

    if (widthMode && widthMode !== 'auto') {
      this.selectAll('.flat-list-item-wrapper').forEach((el) => {
        el.style.flex = `0 0 ${widthMode}`;
        el.style.width = widthMode;
        el.style.maxWidth = widthMode;
      });
      return;
    }

    this.selectAll('.flat-list-item-wrapper').forEach((el) => {
      el.style.flex = '0 0 auto';
    });
  }

  _subscribeToStates() {
    const keys = this._getStateKeys();

    try {
      const unsub = subscribeState(keys.data, () => {
        if (this._isMounted) this.rerender();
      }, { immediate: false });
      this._stateUnsubs.push(unsub);
    } catch (_) {}

    try {
      const unsub = subscribeState(keys.loading, () => {
        if (this._isMounted) this.rerender();
      }, { immediate: false });
      this._stateUnsubs.push(unsub);
    } catch (_) {}
  }

  onDestroy() {
    this._isMounted = false;
    this._flatListInit = false;
    if (this._visibleUpdateRaf) {
      cancelAnimationFrame(this._visibleUpdateRaf);
      this._visibleUpdateRaf = null;
    }
    this._containerRef = null;
    this._resizeOb?.disconnect();
    this._resizeOb = null;
    this._itemsRef.clear();
    this._visibleItemsRef.clear();
  }

  render() {
    const keys = this._getStateKeys();
    let data = [];
    let loading = false;
    let refreshing = false;
    let error = null;

    try { data = getState(keys.data) ?? []; } catch (_) {}
    try { loading = getState(keys.loading) ?? false; } catch (_) {}
    try { refreshing = getState(keys.refreshing) ?? false; } catch (_) {}
    try { error = getState(keys.error) ?? null; } catch (_) {}

    const numColumns = this._getNumColumns();
    const horizontal = this._isHorizontal();
    const isGrid = numColumns > 1 && !horizontal;

    let itemsHtml = '';
    this._renderedItems = [];

    if (error && data.length === 0) {
      itemsHtml = this.renderError();
    } else if (data.length === 0 && !loading) {
      itemsHtml = this.renderEmpty();
    } else {
      data.forEach((item, index) => {
        const key = this.keyExtractor(item, index);
        this._renderedItems.push(key);

        const separators = {
          highlight: () => this._highlightItem(key),
          unhighlight: () => this._unhighlightItem(key)
        };

        const itemHtml = this.renderItem({ item, index, separators });
        const separator = index < data.length - 1 ? this.renderSeparator() : '';

        const wrapperStyle = this._getItemWrapperStyle(isGrid, numColumns, horizontal);

        itemsHtml += `
          <div class="flat-list-item-wrapper" data-key="${key}" data-index="${index}" style="${wrapperStyle}">
            ${itemHtml}
          </div>
          ${separator}
        `;
      });
    }

    const scrollClasses = this._getScrollIndicatorClasses(horizontal);
    const containerClass = [
      'flat-list-container',
      horizontal ? 'horizontal' : 'vertical',
      isGrid ? 'grid' : '',
      refreshing ? 'refreshing' : '',
      ...scrollClasses
    ].filter(Boolean).join(' ');

    return `
      <div class="flatlist flat-list-wrapper">
        ${this.renderHeader()}

        <div class="flatlist ${containerClass}" style="${this._getContainerStyle()}">
          <div class="flat-list-content${horizontal ? ' horizontal-row' : ''}" style="${this._getContentStyle()}">
            ${itemsHtml}
          </div>
          ${loading ? this.renderLoader() : ''}
        </div>

        ${this.renderFooter()}
      </div>
    `;
  }

  _highlightItem(key) {
    const item = this._itemsRef.get(key);
    if (item) item.classList.add('highlighted');
  }

  _unhighlightItem(key) {
    const item = this._itemsRef.get(key);
    if (item) item.classList.remove('highlighted');
  }

  _getItemWrapperStyle(isGrid, numColumns, horizontal) {
    if (isGrid) return `flex: 0 0 calc(${100 / numColumns}% - 8px);`;
    if (horizontal) {
      const w = this.constructor.horizontalItemWidth;
      if (w) return `flex: 0 0 ${w};`;
      return 'flex: 0 0 auto;';
    }
    return '';
  }

  _getContainerStyle() {
    const horizontal = this._isHorizontal();
    if (horizontal) return 'overflow-x: auto; overflow-y: hidden;';
    return 'overflow-y: auto; overflow-x: hidden;';
  }

  _getContentStyle() {
    const numColumns = this._getNumColumns();
    const horizontal = this._isHorizontal();
    const isGrid = numColumns > 1 && !horizontal;

    if (isGrid) return 'display: flex; flex-wrap: wrap; gap: 8px;';
    if (horizontal) return 'display: flex; flex-direction: row; flex-wrap: nowrap; align-items: stretch; height: 100%; width: max-content; min-width: 100%;';
    return '';
  }

  styleSheet() {
    return `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }

        .flatlist {
          scrollbar-width: inherit;
          scrollbar-color: inherit;
        }

        .flat-list-wrapper {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
        }

        .flat-list-container {
          flex: 1;
          position: relative;
        }

        .flat-list-container.hide-scroll-v {
          scrollbar-width: none;
        }

        .flat-list-container.hide-scroll-v::-webkit-scrollbar {
          display: none;
        }

        .flat-list-container.hide-scroll-h {
          scrollbar-width: none;
        }

        .flat-list-container.hide-scroll-h::-webkit-scrollbar {
          display: none;
        }

        .flat-list-container.vertical {
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }

        .flat-list-container.horizontal {
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }

        .flat-list-content.horizontal-row,
        .flat-list-container.horizontal .flat-list-content {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: flex-start;
          width: max-content;
          min-width: 100%;
          min-height: unset;
          height: auto;
        }

        .flat-list-container.horizontal .flat-list-item-wrapper {
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .flat-list-content {
          min-height: 100%;
        }

        .flat-list-item-wrapper {
          position: relative;
        }

        .flat-list-item-wrapper.highlighted {
          opacity: 0.7;
        }

        .flat-list-separator {
          height: 1px;
          background: var(--border-color, #e5e7eb);
          margin: 8px 0;
        }

        .flat-list-loader {
          padding: 20px 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .loader-track {
          width: 100%;
          max-width: 200px;
          height: 3px;
          background: var(--surface-2, #e5e7eb);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }

        .loader-bar {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          width: 40%;
          background: linear-gradient(90deg,
            var(--primary, #3b82f6) 0%,
            var(--primary-light, #60a5fa) 50%,
            var(--primary, #3b82f6) 100%
          );
          border-radius: 2px;
          animation: slide-loader 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        @keyframes slide-loader {
          0% { transform: translateX(-100%); }
          45% { transform: translateX(150%); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
          55% { transform: translateX(150%); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
          100% { transform: translateX(300%); }
        }

        .flat-list-empty,
        .flat-list-error {
          padding: 32px;
          text-align: center;
          color: var(--text-secondary, #6b7280);
        }

        .flat-list-error {
          color: var(--error, #ef4444);
        }

        .flat-list-container.refreshing::before {
          content: 'Refreshing...';
          display: block;
          padding: 16px;
          text-align: center;
          color: var(--text-secondary, #6b7280);
        }

        .flat-list-container.grid .flat-list-content {
          justify-content: flex-start;
        }
      </style>
    `;
  }
}

export default FlatList;
