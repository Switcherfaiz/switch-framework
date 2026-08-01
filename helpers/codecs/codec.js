export function encodeData(obj) {
  const str = JSON.stringify(obj ?? {});
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeData(encoded) {
  try {
    if (!encoded) return {};
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return {};
  }
}

/**
 * Encode a props object for a component's data attribute.
 * Props must be JSON-safe. For callbacks, store the function in a state
 * (createState) and pass the state-key string; the child resolves it with
 * getState() at action time. Read props in the child with this.getProps().
 *
 * Example:
 *   const props = createProps({ label: 'Country', valueState: 'country-value' });
 *   return `<sw-dropdown data="${props}"></sw-dropdown>`;
 */
export function createProps(props = {}) {
  if (props && typeof props === 'object') {
    for (const key of Object.keys(props)) {
      if (typeof props[key] === 'function') {
        console.warn(
          `[switch-framework] createProps: prop "${key}" is a function and will be dropped by JSON encoding. ` +
          `Store the function in a state (createState/updateState) and pass the state-key string instead.`
        );
      }
    }
  }
  return encodeData(props);
}
