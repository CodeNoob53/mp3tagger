/**
 * Tracks every created Blob URL so the session can be cleaned without leaks.
 */
const urls = new Set();

/** @param {Blob} blob @returns {string} */
export function createUrl(blob) {
  const url = URL.createObjectURL(blob);
  urls.add(url);
  return url;
}

/** @param {string|null|undefined} url */
export function revokeUrl(url) {
  if (url && urls.has(url)) {
    URL.revokeObjectURL(url);
    urls.delete(url);
  }
}

/** Revoke everything (session clear / page hide). */
export function revokeAll() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
}

/** @returns {number} live URL count (used by tests) */
export function liveCount() { return urls.size; }
