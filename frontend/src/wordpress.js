const config = window.BDS_WORDPRESS || {};
export const apiUrl = (config.apiUrl || `${process.env.REACT_APP_BACKEND_URL || ""}/api`).replace(/\/$/, "");
export const publicAsset = (path) => `${config.assetUrl || process.env.PUBLIC_URL || ""}${path}`;
export const nativeWordPress = Boolean(config.native);
export function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  if (nativeWordPress) {
    headers.set("X-BDS-Request", "1");
    if (config.nonce) headers.set("X-WP-Nonce", config.nonce);
  }
  return fetch(url, { ...options, headers, credentials: "include" });
}
export function apiPath(path) {
  const [route, query] = path.split("?");
  return `${apiUrl}${route}${query ? `${apiUrl.includes("?") ? "&" : "?"}${query}` : ""}`;
}
