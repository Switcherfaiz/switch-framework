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

export function registerScreens({ stackScreens = [], tabsLayout = null, tabScreens = [], validate = true } = {}) {
  const normalizedStack = (stackScreens || []).map((s) => ({ ...s, layout: 'stack' }));
  const normalizedTabs = (tabScreens || []).map((s) => ({ ...s, layout: 'tabs' }));

  if (validate) {
    assertExpoConventions({ tabsLayout, stackScreens: normalizedStack, tabScreens: normalizedTabs });
  }

  return {
    screens: [...normalizedStack, ...normalizedTabs]
  };
}
