/**
 * Windowing helpers for ScrollView / FlatList virtualized mode.
 */

export function readVirtualConfig(host, Cls) {
  const read = (name, fallback) => {
    if (typeof host._read === 'function') return host._read(name, fallback);
    return Cls?.[name] ?? fallback;
  };
  return {
    enabled: !!read('virtualized', false),
    initial: Math.max(1, Number(read('initialNumToRender', 10)) || 10),
    windowSize: Math.max(1, Number(read('windowSize', 21)) || 21),
    batch: Math.max(1, Number(read('maxToRenderPerBatch', 10)) || 10),
    estimatedSize: Math.max(1, Number(read('estimatedItemSize', 72)) || 72),
    removeClipped: read('removeClippedSubviews', true) !== false,
  };
}

export function sumItemSizes(items, start, end, sizeForIndex) {
  let total = 0;
  for (let i = start; i < end && i < items.length; i += 1) {
    total += sizeForIndex(i, items[i]);
  }
  return total;
}

export function computeVirtualRange({
  items,
  scrollTop = 0,
  viewport = 320,
  initial = 10,
  windowSize = 21,
  estimatedSize = 72,
  sizeForIndex,
}) {
  const count = items.length;
  if (!count) return { start: 0, end: 0, top: 0, bottom: 0 };

  const sizeAt = (index, item) => {
    if (typeof sizeForIndex === 'function') return sizeForIndex(index, item);
    return estimatedSize;
  };

  if (!viewport) {
    const end = Math.min(count, initial);
    return {
      start: 0,
      end,
      top: 0,
      bottom: sumItemSizes(items, end, count, (i, item) => sizeAt(i, item)),
    };
  }

  const visible = Math.max(1, Math.ceil(viewport / estimatedSize));
  const overscan = Math.max(visible, Math.floor((windowSize * visible - visible) / 2));

  let top = 0;
  let start = 0;
  for (; start < count; start += 1) {
    const h = sizeAt(start, items[start]);
    if (top + h > scrollTop) break;
    top += h;
  }
  start = Math.max(0, start - overscan);
  top = sumItemSizes(items, 0, start, (i, item) => sizeAt(i, item));

  let end = start;
  let painted = 0;
  const budget = viewport + overscan * estimatedSize * 2;
  for (; end < count && painted < budget; end += 1) {
    painted += sizeAt(end, items[end]);
  }
  end = Math.min(count, end + overscan);

  const bottom = sumItemSizes(items, end, count, (i, item) => sizeAt(i, item));
  return { start, end, top, bottom };
}
