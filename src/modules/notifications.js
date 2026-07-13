/**
 * Toast notifications. The container has aria-live="polite" in index.html.
 */
import { h } from './utils.js';

let region;

function ensureRegion() {
  region ??= document.getElementById('toast-region');
  return region;
}

/**
 * Show a toast.
 * @param {string} message
 * @param {{ type?: 'info'|'success'|'warning'|'error', timeout?: number }} [opts]
 */
export function toast(message, opts = {}) {
  const { type = 'info', timeout = type === 'error' ? 9000 : 5000 } = opts;
  const el = h('div', { class: `toast toast--${type}`, role: type === 'error' ? 'alert' : 'status' });
  const text = h('span', {}, message);
  const close = h('button', { class: 'btn btn--icon toast__close', 'aria-label': 'Dismiss notification' }, '✕');
  close.addEventListener('click', () => el.remove());
  el.append(text, close);
  ensureRegion().append(el);
  if (timeout > 0) setTimeout(() => el.remove(), timeout);
}

export const notify = {
  info: (m) => toast(m, { type: 'info' }),
  success: (m) => toast(m, { type: 'success' }),
  warning: (m) => toast(m, { type: 'warning' }),
  error: (m) => toast(m, { type: 'error' }),
};

/**
 * Centralized error reporter: logs and shows a friendly toast.
 * @param {unknown} err
 * @param {{ file?: string, action?: string, originalIntact?: boolean }} [ctx]
 */
export function reportError(err, ctx = {}) {
  console.error(ctx.action ?? 'error', err);
  const parts = [];
  if (ctx.action) parts.push(`${ctx.action} failed.`);
  if (ctx.file) parts.push(`File: ${ctx.file}.`);
  parts.push(err instanceof Error ? err.message : String(err));
  if (ctx.originalIntact !== false) parts.push('Your original file is untouched.');
  notify.error(parts.join(' '));
}
