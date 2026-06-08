let globalSheet = null;

export function getGlobalComponentSheet() {
  return globalSheet;
}

export async function setGlobalComponentSheet(styleChunks = []) {
  globalSheet = new CSSStyleSheet();
  const css = Array.isArray(styleChunks) ? styleChunks.filter(Boolean).join('\n') : String(styleChunks || '');

  // We MUST use .replace() for @import, not .replaceSync()
  await globalSheet.replace(css);

  globalThis.globalComponentSheet = globalSheet;
  return globalSheet;
}

export function adoptGlobalComponentSheet(shadowRoot) {
  const sheet = globalThis.globalComponentSheet || globalSheet;
  if (!shadowRoot || !sheet) return false;
  if (!('adoptedStyleSheets' in shadowRoot)) return false;

  const current = Array.isArray(shadowRoot.adoptedStyleSheets) ? shadowRoot.adoptedStyleSheets : [];
  if (current.includes(sheet)) return true;
  shadowRoot.adoptedStyleSheets = [...current, sheet];
  return true;
}
