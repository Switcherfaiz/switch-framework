export function assertExpoConventions({ tabsLayout, stackScreens, tabScreens }) {
  const errors = [];

  (stackScreens || []).forEach((s) => {
    if (s?.layout && s.layout !== 'stack') errors.push(`Stack screen "${s.name}" must have layout "stack".`);
  });

  (tabScreens || []).forEach((s) => {
    if (s?.layout && s.layout !== 'tabs') errors.push(`Tab screen "${s.name}" must have layout "tabs".`);
  });

  const tabs = Array.isArray(tabsLayout?.tabs) ? tabsLayout.tabs : [];
  const owned = new Set(
    tabs.flatMap((t) => {
      const matchList = Array.isArray(t?.match) ? t.match : [t?.name].filter(Boolean);
      return matchList.map((m) => String(m));
    })
  );

  (tabScreens || []).forEach((s) => {
    const base = String(s?.name || '').split('/')[0];
    if (!base) return;
    if (!owned.has(base) && !owned.has(String(s?.name || ''))) {
      errors.push(`Tab route "${s.name}" is not owned by any tab. Add it to a tab.match list.`);
    }
  });

  if (errors.length) throw new Error(errors.join('\n'));
}

/**
 * Auto-register custom element if class has static tag. No user-defined customElements.define needed.
 * Called automatically for screens/layouts via registerScreens. For other components, use registerComponents.
 */
export function ensureComponentDefined(Cls) {
  if (Cls?.tag && typeof Cls === 'function' && !customElements.get(Cls.tag)) {
    customElements.define(Cls.tag, Cls);
  }
}

/**
 * Register multiple SwitchComponent subclasses at once. Call from layout (like screens).
 * No need to call registerComponent in each component file.
 */
export function registerComponents(components = []) {
  (Array.isArray(components) ? components : [components]).forEach(ensureComponentDefined);
}

function normalizeScreen(screen) {
  if (screen && typeof screen.getScreenConfig === 'function') {
    ensureComponentDefined(screen);
    return { ...screen.getScreenConfig(), layout: screen.layout ?? screen.getScreenConfig().layout };
  }
  return screen;
}

function normalizeTabsLayout(layout) {
  if (layout && typeof layout.getLayoutConfig === 'function') {
    ensureComponentDefined(layout);
    const cfg = layout.getLayoutConfig();
    const screens = layout.screens ?? cfg.screens ?? [];
    screens.forEach(ensureComponentDefined);
    return { ...layout, ...cfg, screens };
  }
  return layout;
}

export function registerScreens({ stackScreens = [], tabsLayout = null, tabScreens = [], validate = true } = {}) {
  const resolvedTabsLayout = normalizeTabsLayout(tabsLayout);
  const tabScreensFromLayout = resolvedTabsLayout?.screens || tabScreens;

  const normalizedStack = (stackScreens || []).map((s) => {
    ensureComponentDefined(s);
    const cfg = normalizeScreen(s);
    return { ...cfg, layout: cfg.layout || 'stack' };
  });
  const normalizedTabs = (tabScreensFromLayout || []).map((s) => {
    const cfg = normalizeScreen(s);
    return { ...cfg, layout: cfg.layout || 'tabs' };
  });

  if (validate) {
    assertExpoConventions({ tabsLayout: resolvedTabsLayout, stackScreens: normalizedStack, tabScreens: normalizedTabs });
  }

  return {
    screens: [...normalizedStack, ...normalizedTabs],
    tabsLayout: resolvedTabsLayout
  };
}
