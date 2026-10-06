/** Hide the mobile tap flash; long-press text selection is unchanged. */
export const TAP_HIGHLIGHT_CSS = `
  :host, *, *::before, *::after {
    -webkit-tap-highlight-color: transparent;
    tap-highlight-color: transparent;
  }
`;

const TAP_HIGHLIGHT_DOCUMENT_CSS = `
  html, body, *, *::before, *::after {
    -webkit-tap-highlight-color: transparent;
    tap-highlight-color: transparent;
  }
`;

export function installTapHighlightReset() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('sw-tap-highlight')) return;
  const style = document.createElement('style');
  style.id = 'sw-tap-highlight';
  style.textContent = TAP_HIGHLIGHT_DOCUMENT_CSS;
  document.head.appendChild(style);
}
