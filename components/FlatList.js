import { SwitchComponent, getState, subscribeState } from '../index.js';

/**
 * FlatList – React Native-inspired list component for Switch Framework
 *
 * STATES (trigger re-render when changed via createState):
 * - data: Array of items to render
 * - loading: Boolean for loading state
 * - refreshing: Boolean for pull-to-refresh state
 * - error: Error state for failed loads
 *
 * REFS (for DOM manipulation without re-render):
 * - _containerRef: The scrollable container element
 * - _itemsRef: Map of rendered item elements
 * - _scrollPositionRef: Current scroll position
 * - _isNearEndRef: Boolean for end detection
 * - _visibleItemsRef: Set of currently visible item keys
 *
 * USER OVERRIDABLE METHODS:
 * - renderItem({ item, index, separators }): Render a single item
 * - renderLoader(): Render loading indicator
 * - renderEmpty(): Render when data is empty
 * - renderHeader(): Render header component
 * - renderFooter(): Render footer component
 * - renderSeparator(): Render separator between items
 * - renderError(): Render error state
 * - keyExtractor(item, index): Generate unique key for item
 * - onEndReached(): Called when scrolling near end
 * - onRefresh(): Called for pull-to-refresh
 * - onScroll(event): Called on scroll events
 * - getItemLayout(data, index): For optimization with fixed-size items
 */

export class FlatList extends SwitchComponent {
  static tag = 'sw-flat-list';

  // Static configuration that users can override
  static numColumns = 1;
  static horizontal = false;
  static initialNumToRender = 10;
  static maxToRenderPerBatch = 10;
  static windowSize = 21;
  static onEndReachedThreshold = 0.5;
  static trackVisibleItems = false;

  constructor() {
    super();

    // REFS: DOM manipulation without re-rendering entire component
    this._containerRef = null;
    this._itemsRef = new Map();
    this._scrollPositionRef = { x: 0, y: 0 };
    this._isNearEndRef = false;
    this._visibleItemsRef = new Set();

    // Internal non-reactive state
    this._renderedItems = [];
    this._isMounted = false;

    // Throttle expensive scroll computations
    this._visibleUpdateRaf = null;
  }

  // ========== USER OVERRIDABLE RENDER METHODS ==========

  /**
   * Render a single item - MUST be overridden by user
   * @param {Object} params - { item, index, separators: { highlight, unhighlight } }
   * @returns {string} HTML string for the item
   */
  renderItem({ item, index, separators }) {
    return `<div class="flat-list-item" data-index="${index}">${JSON.stringify(item)}</div>`;
  }

  /**
   * Extract unique key from item - override for custom keys
   */
  keyExtractor(item, index) {
    return item?.id ?? item?.key ?? `item-${index}`;
  }

  /**
   * Render loading indicator at bottom
   */
  renderLoader() {
    return `
      <div class="flat-list-loader">
        <div class="loader-track">
          <div class="loader-bar"></div>
        </div>
      </div>
    `;
  }

  /**
   * Render when data array is empty
   */
  renderEmpty() {
    return `<div class="flat-list-empty">No items</div>`;
  }

  /**
   * Render header component
   */
  renderHeader() {
    return '';
  }

  /**
   * Render footer component
   */
  renderFooter() {
    return '';
  }

  /**
   * Render separator between items
   */
  renderSeparator() {
    return '<div class="flat-list-separator"></div>';
  }

  /**
   * Render error state
   */
  renderError() {
    return `<div class="flat-list-error">Error loading data</div>`;
  }

  /**
   * Get item layout for optimization (fixed-size items)
   * Return { length: number, offset: number, index: number }
   */
  getItemLayout(data, index) {
    return null;
  }

  // ========== EVENT HANDLERS ==========

  /**
   * Called when user scrolls near the end
   * User should load more data here
   */
  onEndReached() {
    console.log('[FlatList] onEndReached');
  }

  /**
   * Called for pull-to-refresh
   * User should refresh data here
   */
  onRefresh() {
    console.log('[FlatList] onRefresh');
  }

  /**
   * Scroll event handler
   * @param {Event} event - Scroll event
   */
  onScroll(event) {
    this._handleScroll(event);
  }

  // ========== INTERNAL METHODS ==========

  _handleScroll(event) {
    const container = event.target;
    const { scrollTop, scrollLeft, scrollHeight, clientHeight, scrollWidth, clientWidth } = container;

    this._scrollPositionRef = { x: scrollLeft, y: scrollTop };

    const isHorizontal = this.constructor.horizontal;
    const threshold = this.constructor.onEndReachedThreshold ?? 0.5;

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
    return {
      data: `${tag}-data`,
      loading: `${tag}-loading`,
      refreshing: `${tag}-refreshing`,
      error: `${tag}-error`
    };
  }

  // ========== PUBLIC API METHODS ==========

  scrollToIndex({ index, animated = true, viewOffset = 0 }) {
    const itemKey = this._renderedItems[index];
    if (!itemKey) return;

    const element = this._itemsRef.get(itemKey);
    if (element) {
      element.scrollIntoView({ behavior: animated ? 'smooth' : 'auto', block: 'start' });
    }
  }

  scrollToEnd({ animated = true } = {}) {
    if (!this._containerRef) return;
    const { scrollHeight, scrollWidth } = this._containerRef;
    const isHorizontal = this.constructor.horizontal;

    this._containerRef.scrollTo({
      [isHorizontal ? 'left' : 'top']: isHorizontal ? scrollWidth : scrollHeight,
      behavior: animated ? 'smooth' : 'auto'
    });
  }

  scrollToOffset({ offset, animated = true }) {
    if (!this._containerRef) return;
    const isHorizontal = this.constructor.horizontal;

    this._containerRef.scrollTo({
      [isHorizontal ? 'left' : 'top']: offset,
      behavior: animated ? 'smooth' : 'auto'
    });
  }

  recordInteraction() {
    // Used for highlighting items on interaction
  }

  flashScrollIndicators() {
    if (this._containerRef) {
      this._containerRef.style.scrollbarColor = 'var(--primary) transparent';
      setTimeout(() => {
        if (this._containerRef) this._containerRef.style.scrollbarColor = '';
      }, 300);
    }
  }

  // ========== LIFECYCLE ==========

  onMount() {
    this._isMounted = true;
    this._containerRef = this.select('.flat-list-container');

    if (this._containerRef) {
      this._containerRef.addEventListener('scroll', (e) => this.onScroll(e));
    }

    const items = this.selectAll('.flat-list-item-wrapper');
    items.forEach((item) => {
      const key = item.dataset.key;
      if (key) this._itemsRef.set(key, item);
    });

    this._subscribeToStates();
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
    if (this._visibleUpdateRaf) {
      cancelAnimationFrame(this._visibleUpdateRaf);
      this._visibleUpdateRaf = null;
    }
    this._containerRef = null;
    this._itemsRef.clear();
    this._visibleItemsRef.clear();
  }

  // ========== RENDER ==========

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

    const numColumns = this.constructor.numColumns ?? 1;
    const horizontal = this.constructor.horizontal ?? false;
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

        itemsHtml += `
          <div class="flat-list-item-wrapper" data-key="${key}" data-index="${index}" style="${isGrid ? `flex: 0 0 calc(${100 / numColumns}% - 8px);` : ''}">
            ${itemHtml}
          </div>
          ${separator}
        `;
      });
    }

    const containerClass = [
      'flat-list-container',
      horizontal ? 'horizontal' : 'vertical',
      isGrid ? 'grid' : '',
      refreshing ? 'refreshing' : ''
    ].filter(Boolean).join(' ');

    return `
      <div class="flat-list-wrapper">
        ${this.renderHeader()}

        <div class="${containerClass}" style="${this._getContainerStyle()}">
          <div class="flat-list-content" style="${this._getContentStyle()}">
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

  _getContainerStyle() {
    const horizontal = this.constructor.horizontal ?? false;
    return horizontal
      ? 'overflow-x: auto; overflow-y: hidden; display: flex;'
      : 'overflow-y: auto; overflow-x: hidden;';
  }

  _getContentStyle() {
    const numColumns = this.constructor.numColumns ?? 1;
    const horizontal = this.constructor.horizontal ?? false;
    const isGrid = numColumns > 1 && !horizontal;

    if (isGrid) return 'display: flex; flex-wrap: wrap; gap: 8px;';
    if (horizontal) return 'display: flex; flex-direction: row;';
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

        .flat-list-container.vertical {
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }

        .flat-list-container.horizontal {
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
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
