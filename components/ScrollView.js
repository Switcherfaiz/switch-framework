import { SwitchComponent } from '../registers/SwitchComponent.js';
import { bindStaticRefs, bindInstanceRefs } from '../state-managers/index.js';
import { resolveBinding, watchBinding, ensureBinding } from './listBindings.js';
import { readVirtualConfig, computeVirtualRange } from './listVirtual.js';

const SCROLLVIEW_SCOPE = 'scrollview';
const PATCH_KEYS = new Set(['data', 'loading', 'error', 'refreshing']);
const LAYOUTS = new Set(['none', 'stack', 'row', 'grid', 'masonry']);

/**
 * ScrollView – viewport + append protocol for Switch Framework.
 *
 * Orientation is the scroll axis only (`vertical` | `horizontal` | `both`).
 * Inner items are not forced into that axis — use `layout` (or your own CSS)
 * for stack / row / grid / masonry.
 *
 * Props may be a state key or a plain value:
 *   createProps({ orientation: 'vertical' })
 *   createProps({ orientation: 'feed-axis' })
 * Static keys work the same: `static dataState = 'home-pins'`.
 *
 * Data / loading / empty patch with onState + insertAdjacentHTML.
 * Axis / layout keys remount the shell (refs rebind in onUpdate).
 */
export class ScrollView extends SwitchComponent {
  static tag = 'sw-scroll-view';

  static orientation = 'vertical';
  static layout = 'none';
  static numColumns = 1;
  static onEndReachedThreshold = 0.5;
  static showsVerticalScrollIndicator = true;
  static showsHorizontalScrollIndicator = true;

  static dataState = '';
  static loadingState = '';
  static errorState = '';
  static refreshingState = '';
  static orientationState = '';
  static layoutState = '';
  static numColumnsState = '';

  static virtualized = false;
  static initialNumToRender = 10;
  static maxToRenderPerBatch = 10;
  static windowSize = 21;
  static estimatedItemSize = 72;
  static removeClippedSubviews = true;

  static virtualizedState = '';
  static initialNumToRenderState = '';
  static windowSizeState = '';
  static estimatedItemSizeState = '';

  static processStyleSheet(css) {
    return String(css).replace(
      new RegExp(`(?<![\\w.-])${SCROLLVIEW_SCOPE}(?=::|[\\s.#\\[,>+~])`, 'gi'),
      `.${SCROLLVIEW_SCOPE}`
    );
  }

  constructor() {
    super();
    this._portRef = null;
    this._contentRef = null;
    this._itemsRef = new Map();
    this._renderedItems = [];
    this._paintedCount = 0;
    this._scrollPositionRef = { x: 0, y: 0 };
    this._isNearEndRef = false;
    this._isMounted = false;
    this._bindingsWatched = false;
    this._onScrollBound = (event) => this.onScroll(event);
    this._virtualStart = 0;
    this._virtualEnd = 0;
    this._itemSizeCache = new Map();
    this._virtualRaf = null;
  }

  _virtualConfig() {
    return readVirtualConfig(this, this.constructor);
  }

  _isVirtualized() {
    return this._virtualConfig().enabled;
  }

  _sizeForIndex(index, item) {
    const layout = typeof this.getItemLayout === 'function'
      ? this.getItemLayout(this._readData(), index)
      : null;
    if (layout?.length) return layout.length;
    const key = this.keyExtractor(item, index);
    return this._itemSizeCache.get(key) || this._virtualConfig().estimatedSize;
  }

  _computeVirtualRange() {
    const items = this._readData();
    const port = this._portRef;
    return computeVirtualRange({
      items,
      scrollTop: port?.scrollTop || 0,
      viewport: port?.clientHeight || 0,
      initial: this._virtualConfig().initial,
      windowSize: this._virtualConfig().windowSize,
      estimatedSize: this._virtualConfig().estimatedSize,
      sizeForIndex: (index, item) => this._sizeForIndex(index, item),
    });
  }

  _virtualItemsHtml(items, start) {
    if (!this._isVirtualized()) return this._itemsHtml(items, start);
    const cfg = this._virtualConfig();
    const slice = items.slice(start, Math.min(items.length, start + cfg.batch));
    return this._itemsHtml(slice, start);
  }

  _renderVirtualWindow() {
    const content = this._contentRef;
    if (!content || !this._isVirtualized()) return;
    const items = this._readData();
    const range = this._computeVirtualRange();
    content.innerHTML = `
      <div data-virtual-spacer-top class="scroll-virtual-spacer" style="height:${range.top}px"></div>
      <div data-virtual-items>${this._itemsHtml(items.slice(range.start, range.end), range.start)}</div>
      <div data-virtual-spacer-bottom class="scroll-virtual-spacer" style="height:${range.bottom}px"></div>
    `;
    this._virtualStart = range.start;
    this._virtualEnd = range.end;
    this._indexItems();
    this._measureItemSizes();
    this._applyClippedSubviews();
  }

  _measureItemSizes() {
    if (!this._isVirtualized()) return;
    this.selectAll('[data-virtual-items] [data-key]').forEach((el) => {
      const key = el.getAttribute('data-key');
      const index = Number(el.getAttribute('data-index'));
      if (!key || !Number.isFinite(index)) return;
      const h = el.getBoundingClientRect().height;
      if (h > 0) this._itemSizeCache.set(key, h);
    });
  }

  _applyClippedSubviews() {
    if (!this._virtualConfig().removeClipped) return;
    const port = this._portRef;
    if (!port) return;
    const rect = port.getBoundingClientRect();
    const buffer = this._virtualConfig().estimatedSize * 2;
    this.selectAll('[data-virtual-items] [data-key]').forEach((el) => {
      const box = el.getBoundingClientRect();
      const visible = !(box.bottom < rect.top - buffer || box.top > rect.bottom + buffer);
      el.style.visibility = visible ? '' : 'hidden';
      el.style.pointerEvents = visible ? '' : 'none';
      el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  _scheduleVirtualUpdate() {
    if (!this._isVirtualized() || !this._portRef) return;
    if (this._virtualRaf) return;
    this._virtualRaf = requestAnimationFrame(() => {
      this._virtualRaf = null;
      const range = this._computeVirtualRange();
      if (range.start !== this._virtualStart || range.end !== this._virtualEnd) {
        this._renderVirtualWindow();
      } else {
        this._applyClippedSubviews();
      }
    });
  }

  _shell() {
    return {
      root: 'scrollview scroll-view',
      port: 'scrollview scroll-view-port',
      content: 'scroll-view-content',
      empty: 'scroll-view-empty',
      error: 'scroll-view-error',
      loader: 'scroll-view-loader',
      item: 'scroll-view-item'
    };
  }

  _binding(name, fallback) {
    return resolveBinding(this, name, fallback);
  }

  _read(name, fallback) {
    return this._binding(name, fallback).value;
  }

  orientation() {
    const value = String(this._read('orientation', this.constructor.orientation || 'vertical') || 'vertical');
    if (value === 'x') return 'horizontal';
    if (value === 'y') return 'vertical';
    if (value === 'both' || value === 'horizontal' || value === 'vertical') return value;
    return 'vertical';
  }

  layout() {
    const value = String(this._read('layout', this.constructor.layout || 'none') || 'none');
    return LAYOUTS.has(value) ? value : 'none';
  }

  numColumns() {
    return Number(this._read('numColumns', this.constructor.numColumns || 1)) || 1;
  }

  _readData() {
    const value = this._read('data', []);
    return Array.isArray(value) ? value : [];
  }

  renderItem({ item, index }) {
    return `<div class="scroll-view-item-body" data-index="${index}">${escapeHtml(stringifyItem(item))}</div>`;
  }

  keyExtractor(item, index) {
    return String(item?.id ?? item?.key ?? `item-${index}`);
  }

  renderLoader() {
    return `
      <div class="scroll-view-loader-bar">
        <div class="loader-track"><div class="loader-bar"></div></div>
      </div>
    `;
  }

  renderEmpty() {
    return `<div class="scroll-view-empty-label">No items</div>`;
  }

  renderHeader() {
    return '';
  }

  renderFooter() {
    return '';
  }

  renderSeparator() {
    return '';
  }

  renderError() {
    return `<div class="scroll-view-error-label">Error loading data</div>`;
  }

  renderContent(items) {
    if (!this._isVirtualized()) return this._itemsHtml(items, 0);
    const range = computeVirtualRange({
      items,
      scrollTop: 0,
      viewport: 0,
      initial: this._virtualConfig().initial,
      windowSize: this._virtualConfig().windowSize,
      estimatedSize: this._virtualConfig().estimatedSize,
      sizeForIndex: (index, item) => this._sizeForIndex(index, item),
    });
    this._virtualStart = range.start;
    this._virtualEnd = range.end;
    return `
      <div data-virtual-spacer-top class="scroll-virtual-spacer" style="height:${range.top}px"></div>
      <div data-virtual-items>${this._itemsHtml(items.slice(range.start, range.end), range.start)}</div>
      <div data-virtual-spacer-bottom class="scroll-virtual-spacer" style="height:${range.bottom}px"></div>
    `;
  }

  onEndReached() {}

  onScroll(event) {
    this._handleScroll(event);
  }

  _handleScroll(event) {
    const port = event.target;
    const { scrollTop, scrollLeft, scrollHeight, clientHeight, scrollWidth, clientWidth } = port;
    this._scrollPositionRef = { x: scrollLeft, y: scrollTop };

    const axis = this.orientation();
    const threshold = Number(this._read('onEndReachedThreshold', 0.5)) || 0.5;
    const nearY = scrollTop + clientHeight >= scrollHeight - threshold * clientHeight;
    const nearX = scrollLeft + clientWidth >= scrollWidth - threshold * clientWidth;
    const isNearEnd = axis === 'horizontal' ? nearX : axis === 'both' ? (nearX || nearY) : nearY;

    if (isNearEnd && !this._isNearEndRef) {
      this._isNearEndRef = true;
      this.onEndReached();
    } else if (!isNearEnd) {
      this._isNearEndRef = false;
    }

    this._scheduleVirtualUpdate();
  }

  _itemsHtml(items, start = 0) {
    const list = Array.isArray(items) ? items : [];
    const total = start + list.length;
    const prefix = start > 0 ? this.renderSeparator() : '';
    return prefix + list.map((item, i) => {
      const index = start + i;
      const key = this.keyExtractor(item, index);
      const html = this.renderItem({ item, index, separators: this._separators(key) });
      const sep = index < total - 1 ? this.renderSeparator() : '';
      return this._wrapItem(html, key, index) + sep;
    }).join('');
  }

  _wrapItem(itemHtml, key, index) {
    const shell = this._shell();
    return `<div class="${shell.item}" data-key="${escapeAttr(key)}" data-index="${index}">${itemHtml}</div>`;
  }

  _separators(key) {
    return {
      highlight: () => this._itemsRef.get(key)?.classList.add('highlighted'),
      unhighlight: () => this._itemsRef.get(key)?.classList.remove('highlighted')
    };
  }

  _indexItems() {
    this._itemsRef.clear();
    this._renderedItems = [];
    this.selectAll('[data-scroll-content] [data-key]').forEach((el) => {
      const key = el.getAttribute('data-key');
      if (!key) return;
      this._itemsRef.set(key, el);
      this._renderedItems.push(key);
    });
    this._paintedCount = this._renderedItems.length;
  }

  _shouldReset(nextKeys) {
    const current = this._renderedItems;
    if (!current.length) return true;
    if (nextKeys.length < current.length) return true;
    for (let i = 0; i < current.length; i += 1) {
      if (current[i] !== nextKeys[i]) return true;
    }
    return false;
  }

  _patchData(next) {
    const items = Array.isArray(next) ? next : [];
    const nextKeys = items.map((item, index) => this.keyExtractor(item, index));
    const content = this._contentRef;
    if (!content) return;

    if (this._isVirtualized()) {
      if (!items.length) {
        content.innerHTML = '';
        this._renderedItems = [];
        this._paintedCount = 0;
        this._itemsRef.clear();
        this._virtualStart = 0;
        this._virtualEnd = 0;
        this._syncChrome();
        return;
      }
      if (this._shouldReset(nextKeys)) {
        this._virtualStart = 0;
        this._renderVirtualWindow();
      } else if (items.length > this._paintedCount) {
        this._renderVirtualWindow();
      }
      this._syncChrome();
      return;
    }

    if (!items.length) {
      content.innerHTML = '';
      this._renderedItems = [];
      this._paintedCount = 0;
      this._itemsRef.clear();
      this._syncChrome();
      return;
    }

    if (this._shouldReset(nextKeys)) {
      content.innerHTML = this._itemsHtml(items, 0);
      this._indexItems();
      this._syncChrome();
      return;
    }

    if (items.length > this._paintedCount) {
      content.insertAdjacentHTML('beforeend', this._itemsHtml(items.slice(this._paintedCount), this._paintedCount));
      this._indexItems();
    }

    this._syncChrome();
  }

  _syncChrome() {
    const items = this._readData();
    const loading = !!this._read('loading', false);
    const error = this._read('error', null);
    const refreshing = !!this._read('refreshing', false);
    const emptyEl = this.select('[data-scroll-empty]');
    const errorEl = this.select('[data-scroll-error]');
    const loaderEl = this.select('[data-scroll-loader]');
    const content = this._contentRef;
    const port = this._portRef;

    const showError = !!(error && !items.length);
    const hasPainted = this._paintedCount > 0 || hasContentNodes(content);
    const showEmpty = !loading && !showError && !items.length && !hasPainted;

    if (emptyEl) emptyEl.hidden = !showEmpty;
    if (errorEl) errorEl.hidden = !showError;
    if (loaderEl) loaderEl.hidden = !loading;
    if (content) content.hidden = showEmpty || showError;
    port?.classList.toggle('refreshing', refreshing);
  }

  append(html) {
    const content = this._contentRef;
    if (!content || html == null || html === '') return;
    content.hidden = false;
    content.insertAdjacentHTML('beforeend', String(html));
    this._indexItems();
    this._syncChrome();
  }

  appendItems(items = []) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return;
    const content = this._contentRef;
    if (!content) return;
    content.hidden = false;
    content.insertAdjacentHTML('beforeend', this._itemsHtml(list, this._paintedCount));
    this._indexItems();
    this._syncChrome();
  }

  reset(items = []) {
    const list = Array.isArray(items) ? items : [];
    const content = this._contentRef;
    if (!content) return;
    content.innerHTML = this._itemsHtml(list, 0);
    this._indexItems();
    this._syncChrome();
  }

  scrollTo({ x, y, animated = true } = {}) {
    if (!this._portRef) return;
    const next = { behavior: animated ? 'smooth' : 'auto' };
    if (x != null) next.left = x;
    if (y != null) next.top = y;
    this._portRef.scrollTo(next);
  }

  scrollToIndex({ index, animated = true, viewOffset = 0, viewPosition } = {}) {
    const itemKey = this._renderedItems[index];
    if (!itemKey || !this._portRef) return;
    const element = this._itemsRef.get(itemKey);
    if (!element) return;

    const axis = this.orientation();
    const horizontal = axis === 'horizontal';
    const port = this._portRef;

    if (viewPosition != null) {
      const itemRect = element.getBoundingClientRect();
      const portRect = port.getBoundingClientRect();
      if (horizontal) {
        const itemStart = itemRect.left - portRect.left + port.scrollLeft;
        port.scrollTo({ left: itemStart - (port.clientWidth * viewPosition) + viewOffset, behavior: animated ? 'smooth' : 'auto' });
      } else {
        const itemStart = itemRect.top - portRect.top + port.scrollTop;
        port.scrollTo({ top: itemStart - (port.clientHeight * viewPosition) + viewOffset, behavior: animated ? 'smooth' : 'auto' });
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
    if (!this._portRef) return;
    const axis = this.orientation();
    const port = this._portRef;
    const left = axis === 'vertical' ? port.scrollLeft : port.scrollWidth - port.clientWidth;
    const top = axis === 'horizontal' ? port.scrollTop : port.scrollHeight - port.clientHeight;
    port.scrollTo({ left, top, behavior: animated ? 'smooth' : 'auto' });
  }

  scrollToOffset({ offset, x, y, animated = true } = {}) {
    if (!this._portRef) return;
    const axis = this.orientation();
    if (x != null || y != null) {
      this.scrollTo({ x, y, animated });
      return;
    }
    if (axis === 'horizontal') this._portRef.scrollTo({ left: offset, behavior: animated ? 'smooth' : 'auto' });
    else this._portRef.scrollTo({ top: offset, behavior: animated ? 'smooth' : 'auto' });
  }

  scrollBy({ x = 0, y = 0, animated = true } = {}) {
    this._portRef?.scrollBy({ left: x, top: y, behavior: animated ? 'smooth' : 'auto' });
  }

  recordInteraction() {}

  flashScrollIndicators() {
    if (!this._portRef) return;
    this._portRef.style.scrollbarColor = 'var(--primary) transparent';
    setTimeout(() => {
      if (this._portRef) this._portRef.style.scrollbarColor = '';
    }, 300);
  }

  _bindHost() {
    const prev = this._portRef;
    this._portRef = this.select('[data-scroll-port]');
    this._contentRef = this.select('[data-scroll-content]');
    this._containerRef = this._portRef;

    if (prev && prev !== this._portRef) {
      prev.removeEventListener('scroll', this._onScrollBound);
    }
    if (this._portRef && this._portRef !== prev) {
      this._portRef.addEventListener('scroll', this._onScrollBound);
    }

    this._indexItems();
    if (this._isVirtualized()) {
      this._measureItemSizes();
      this._applyClippedSubviews();
    }
    this._syncChrome();
    bindStaticRefs(this);
    bindInstanceRefs(this);
  }

  _watchBindings() {
    if (this._bindingsWatched) return;
    this._bindingsWatched = true;

    const names = [
      'data', 'loading', 'error', 'refreshing',
      'orientation', 'layout', 'numColumns', 'horizontal',
      'showsVerticalScrollIndicator', 'showsHorizontalScrollIndicator',
      'onEndReachedThreshold'
    ];

    names.forEach((name) => {
      const initial = name === 'data' ? [] : name === 'loading' || name === 'refreshing' ? false : name === 'error' ? null : undefined;
      const binding = this._binding(name, initial);
      if (binding.mode !== 'state') return;
      if (initial !== undefined) ensureBinding(binding, initial);

      watchBinding(this, binding, (next) => {
        if (!this._isMounted) return;
        if (PATCH_KEYS.has(name)) {
          if (name === 'data') this._patchData(next);
          else this._syncChrome();
          return;
        }
        this.rerender();
      });
    });
  }

  onMount() {
    this._isMounted = true;
    this._bindHost();
    this._watchBindings();
  }

  onUpdate() {
    this._bindHost();
  }

  onDestroy() {
    this._isMounted = false;
    this._bindingsWatched = false;
    this._portRef?.removeEventListener('scroll', this._onScrollBound);
    this._portRef = null;
    this._contentRef = null;
    this._containerRef = null;
    this._itemsRef.clear();
    if (this._virtualRaf) {
      cancelAnimationFrame(this._virtualRaf);
      this._virtualRaf = null;
    }
    this._itemSizeCache.clear();
  }

  _indicatorClasses(axis) {
    const showV = !!this._read('showsVerticalScrollIndicator', true);
    const showH = !!this._read('showsHorizontalScrollIndicator', true);
    const classes = [];
    if ((axis === 'vertical' || axis === 'both') && !showV) classes.push('hide-scroll-v');
    if ((axis === 'horizontal' || axis === 'both') && !showH) classes.push('hide-scroll-h');
    return classes.join(' ');
  }

  _portStyle(axis) {
    if (axis === 'horizontal') return 'overflow-x: auto; overflow-y: hidden;';
    if (axis === 'both') return 'overflow: auto;';
    return 'overflow-y: auto; overflow-x: hidden;';
  }

  render() {
    const shell = this._shell();
    const items = this._readData();
    const loading = !!this._read('loading', false);
    const error = this._read('error', null);
    const refreshing = !!this._read('refreshing', false);
    const axis = this.orientation();
    const layout = this.layout();
    const columns = this.numColumns();
    const showError = !!(error && !items.length);
    const showEmpty = !loading && !showError && !items.length;

    return `
      <div class="${shell.root}">
        ${this.renderHeader()}
        <div
          data-scroll-port
          class="${shell.port} orientation-${axis} layout-${layout} ${this._indicatorClasses(axis)} ${refreshing ? 'refreshing' : ''}"
          style="${this._portStyle(axis)} --sv-columns: ${columns};"
        >
          <div data-scroll-empty class="${shell.empty}" ${showEmpty ? '' : 'hidden'}>${this.renderEmpty()}</div>
          <div data-scroll-error class="${shell.error}" ${showError ? '' : 'hidden'}>${this.renderError()}</div>
          <div data-scroll-content class="${shell.content} layout-${layout}" ${showEmpty || showError ? 'hidden' : ''}>
            ${this.renderContent(items)}
            <slot></slot>
          </div>
          <div data-scroll-loader class="${shell.loader}" ${loading ? '' : 'hidden'}>${this.renderLoader()}</div>
        </div>
        ${this.renderFooter()}
      </div>
    `;
  }

  styleSheet() {
    return `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }

        .scroll-view {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
        }

        .scroll-view-port {
          flex: 1;
          min-height: 0;
          min-width: 0;
          position: relative;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }

        .scroll-view-port.hide-scroll-v,
        .scroll-view-port.hide-scroll-h {
          scrollbar-width: none;
        }
        .scroll-view-port.hide-scroll-v::-webkit-scrollbar,
        .scroll-view-port.hide-scroll-h::-webkit-scrollbar {
          display: none;
        }

        .scroll-view-content.layout-stack {
          display: flex;
          flex-direction: column;
        }
        .scroll-view-content.layout-row {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: stretch;
          width: max-content;
          min-width: 100%;
        }
        .scroll-view-content.layout-grid {
          display: grid;
          grid-template-columns: repeat(var(--sv-columns, 2), minmax(0, 1fr));
          gap: 8px;
        }
        .scroll-view-content.layout-masonry {
          column-count: var(--sv-columns, 3);
          column-gap: 16px;
        }
        .scroll-view-content.layout-masonry > * {
          break-inside: avoid;
          display: inline-block;
          width: 100%;
        }

        .scroll-view-item {
          position: relative;
        }
        .scroll-view-item.highlighted {
          opacity: 0.7;
        }

        .scroll-virtual-spacer {
          width: 100%;
          flex-shrink: 0;
          pointer-events: none;
        }

        .scroll-view-empty,
        .scroll-view-error,
        .scroll-view-loader {
          padding: 24px 16px;
        }
        .scroll-view-empty[hidden],
        .scroll-view-error[hidden],
        .scroll-view-loader[hidden],
        .scroll-view-content[hidden] {
          display: none !important;
        }

        .scroll-view-empty-label,
        .scroll-view-error-label {
          text-align: center;
          color: var(--text-secondary, #6b7280);
        }
        .scroll-view-error-label {
          color: var(--error, #ef4444);
        }

        .scroll-view-loader {
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
          background: linear-gradient(90deg, var(--primary, #3b82f6) 0%, var(--primary-light, #60a5fa) 50%, var(--primary, #3b82f6) 100%);
          border-radius: 2px;
          animation: sv-slide-loader 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes sv-slide-loader {
          0% { transform: translateX(-100%); }
          45% { transform: translateX(150%); }
          55% { transform: translateX(150%); }
          100% { transform: translateX(300%); }
        }

        .scroll-view-port.refreshing::before {
          content: 'Refreshing...';
          display: block;
          padding: 16px;
          text-align: center;
          color: var(--text-secondary, #6b7280);
        }
      </style>
    `;
  }
}

function hasContentNodes(content) {
  if (!content) return false;
  return [...content.children].some((node) => node.tagName !== 'SLOT');
}

function stringifyItem(item) {
  if (item == null) return '';
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  try { return JSON.stringify(item); } catch (_) { return String(item); }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

export default ScrollView;
