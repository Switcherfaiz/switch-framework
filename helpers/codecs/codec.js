export function encodeData(obj) {
  return btoa(JSON.stringify(obj ?? {}));
}

export function decodeData(encoded) {
  try {
    if (!encoded) return {};
    const decoded = atob(encoded);
    return JSON.parse(decoded);
  } catch (e) {
    return {};
  }
}
