/** Format bytes as a human-readable size. @param {number} n */
export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format seconds as m:ss. @param {number|undefined} s */
export function formatDuration(s) {
  if (!Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** @returns {string} random id */
export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Set text content of an element (safe alternative to innerHTML).
 * @param {HTMLElement} el @param {string} text
 */
export function setText(el, text) { el.textContent = text; }

/**
 * Create an element with attributes and children (text or nodes).
 * @param {string} tag
 * @param {Record<string,string>} [attrs]
 * @param {...(Node|string)} children
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role') el.setAttribute(k, v);
    else if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  }
  for (const c of children) {
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Debounce. @param {Function} fn @param {number} ms */
export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
