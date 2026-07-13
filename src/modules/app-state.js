/**
 * Central application state with a tiny pub/sub.
 * Events: 'files-changed', 'selection-changed', 'active-changed',
 *         'file-updated' (detail: id), 'settings-changed'
 */
const listeners = new Map();

export const state = {
  /** @type {Map<string, import('./file-manager.js').AppFile>} */
  files: new Map(),
  /** @type {string[]} insertion order of file ids */
  order: [],
  /** @type {Set<string>} checked (multi-selected) file ids */
  selection: new Set(),
  /** @type {string|null} id of the file open in the editor */
  activeId: null,
  settings: {
    id3Version: 3,
    coverLimitMode: 'auto', // 'auto' | KB number
    theme: 'auto',
  },
};

/**
 * Subscribe to a state event.
 * @param {string} event
 * @param {(detail?: unknown) => void} fn
 * @returns {() => void} unsubscribe
 */
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

/**
 * Emit a state event.
 * @param {string} event
 * @param {unknown} [detail]
 */
export function emit(event, detail) {
  for (const fn of listeners.get(event) ?? []) {
    try { fn(detail); } catch (err) { console.error(`listener for "${event}" failed`, err); }
  }
}

/** @returns {import('./file-manager.js').AppFile|null} */
export function getActiveFile() {
  return state.activeId ? state.files.get(state.activeId) ?? null : null;
}

/** @returns {import('./file-manager.js').AppFile[]} files in list order */
export function getOrderedFiles() {
  return state.order.map((id) => state.files.get(id)).filter(Boolean);
}

/** @returns {import('./file-manager.js').AppFile[]} checked files in list order */
export function getSelectedFiles() {
  return getOrderedFiles().filter((f) => state.selection.has(f.id));
}

export function setActive(id) {
  state.activeId = id;
  emit('active-changed', id);
}

export function toggleSelected(id, forceOn) {
  const on_ = forceOn ?? !state.selection.has(id);
  if (on_) state.selection.add(id); else state.selection.delete(id);
  emit('selection-changed');
}

export function clearSelection() {
  state.selection.clear();
  emit('selection-changed');
}
