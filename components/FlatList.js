import { ScrollView } from './ScrollView.js';

const FLATLIST_SCOPE = 'flatlist';

/**
 * FlatList – React Native-inspired list on top of ScrollView.
 *
 * Data / loading patch in place (onState + insertAdjacentHTML). Axis, columns,
 * and indicator keys remount the shell. Pass props as a state key or a literal:
 *   createProps({ horizontal: true })
 *   createProps({ horizontal: 'inbox-horizontal' })
 *
 * USER OVERRIDABLE METHODS:
 * - renderItem, renderLoader, renderEmpty, renderHeader, renderFooter, renderSeparator, renderError
 * - keyExtractor, onEndReached, onRefresh, onScroll, getItemLayout, styleSheet, render
 */
export class FlatList extends ScrollView {
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
  static horizontalItemWidth = '';
  static layout = '';

  static dataState = '';
  static horizontalState = '';
  static numColumnsState = '';
  static loadingState = '';
  static refreshingState = '';
  static errorState = '';

  static processStyleSheet(css) {
    const next = String(css).replace(
      new RegExp(`(?<![\\w.-])${FLATLIST_SCOPE}(?=::|[\\s.#\\[,>+~])`, 'gi'),
      `.${FLATLIST_SCOPE}`
    );
    return ScrollView.processStyleSheet(next);
  }

  constructor() {
    super();
    this._visibleItemsRef = new Set();
    this._visibleUpdateRaf = null;
  }

  _shell() {
    return {
      root: 'flatlist flat-list-wrapper scroll-view',
      port: 'flatlist flat-list-container scroll-view-port',
      content: 'flat-list-content scroll-view-content',
      empty: 'flat-list-empty scroll-view-empty',
      error: 'flat-list-error scroll-view-error',
      loader: 'flat-list-loader scroll-view-loader',
      item: 'flat-list-item-wrapper scroll-view-item'
    };
  }

  _isHorizontal() {
    return !!this._read('horizontal', false);
  }

  orientation() {
    const props = this.getProps() || {};
    if (props.orientation || this.constructor.orientationState) return super.orientation();
    return this._isHorizontal() ? 'horizontal' : 'vertical';
  }

  layout() {
    const props = this.getProps() || {};
    if (props.layout || this.constructor.layoutState || this.constructor.layout) {
      const value = super.layout();
      if (value && value !== 'none') return value;
    }
    if (this._isHorizontal()) return 'row';
    if (this.numColumns() > 1) return 'grid';
    return 'stack';
  }

  renderItem({ item, index }) {
    return `<div class="flat-list-item" data-index="${index}">${JSON.stringify(item)}</div>`;
  }

  renderLoader() {
    return `
      <div class="flat-list-loader-inner">
        <div class="loader-track">
          <div class="loader-bar"></div>
        </div>
      </div>
    `;
  }

  renderEmpty() {
    return `<div class="flat-list-empty-label">No items</div>`;
  }

  renderSeparator() {
    return '<div class="flat-list-separator"></div>';
  }

  renderError() {
    return `<div class="flat-list-error-label">Error loading data</div>`;
  }

  getItemLayout() {
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
    if (this.constructor.trackVisibleItems) this._scheduleVisibleItemsUpdate();
  }

  _scheduleVisibleItemsUpdate() {
    if (!this._portRef) return;
    if (this._visibleUpdateRaf) return;
    this._visibleUpdateRaf = requestAnimationFrame(() => {
      this._visibleUpdateRaf = null;
      this._updateVisibleItems();
    });
  }

  _updateVisibleItems() {
    if (!this._portRef) return;
    const containerRect = this._portRef.getBoundingClientRect();
    const next = new Set();
    for (const [key, element] of this._itemsRef) {
      const rect = element.getBoundingClientRect();
      const isVisible = !(rect.bottom < containerRect.top || rect.top > containerRect.bottom);
      if (isVisible) next.add(key);
    }
    this._visibleItemsRef = next;
  }

  _wrapItem(itemHtml, key, index) {
    const shell = this._shell();
    const layout = this.layout();
    const columns = this.numColumns();
    const style = this._getItemWrapperStyle(layout === 'grid', columns, layout === 'row');
    return `<div class="${shell.item}" data-key="${key}" data-index="${index}" style="${style}">${itemHtml}</div>`;
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

  _syncHorizontalSlideWidths() {
    if (!this._isHorizontal() || !this._portRef) return;
    const widthMode = this.constructor.horizontalItemWidth;
    const port = this._portRef;
    const viewport = port.clientWidth;
    if (!viewport) return;

    if (widthMode === '100%') {
      port.style.scrollSnapType = 'x mandatory';
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

  onMount() {
    super.onMount();
    this._syncHorizontalSlideWidths();
    requestAnimationFrame(() => this._syncHorizontalSlideWidths());

    if (this._isHorizontal() && this.constructor.horizontalItemWidth === '100%' && this._portRef && typeof ResizeObserver !== 'undefined') {
      this._resizeOb = new ResizeObserver(() => this._syncHorizontalSlideWidths());
      this._resizeOb.observe(this._portRef);
      this.addOnDestroy(() => {
        this._resizeOb?.disconnect();
        this._resizeOb = null;
      });
    }
  }

  onUpdate() {
    super.onUpdate();
    this._syncHorizontalSlideWidths();
  }

  onDestroy() {
    if (this._visibleUpdateRaf) {
      cancelAnimationFrame(this._visibleUpdateRaf);
      this._visibleUpdateRaf = null;
    }
    this._resizeOb?.disconnect();
    this._resizeOb = null;
    this._visibleItemsRef.clear();
    super.onDestroy();
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
          min-height: 0;
          position: relative;
        }

        .flat-list-container.hide-scroll-v,
        .flat-list-container.hide-scroll-h {
          scrollbar-width: none;
        }
        .flat-list-container.hide-scroll-v::-webkit-scrollbar,
        .flat-list-container.hide-scroll-h::-webkit-scrollbar {
          display: none;
        }

        .flat-list-content.layout-row,
        .flat-list-container.orientation-horizontal .flat-list-content {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: flex-start;
          width: max-content;
          min-width: 100%;
          min-height: unset;
          height: auto;
        }

        .flat-list-container.orientation-horizontal .flat-list-item-wrapper {
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .flat-list-content.layout-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-start;
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

        .flat-list-empty,
        .flat-list-error {
          padding: 32px;
          text-align: center;
          color: var(--text-secondary, #6b7280);
        }

        .flat-list-error,
        .flat-list-error-label {
          color: var(--error, #ef4444);
        }
      </style>
    `;
  }
}

export default FlatList;
