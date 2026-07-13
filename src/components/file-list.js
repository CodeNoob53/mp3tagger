/**
 * File table: rendering, selection, activation.
 */
import { state, on, emit, setActive, toggleSelected, getOrderedFiles, getSelectedFiles } from '../modules/app-state.js';
import { formatBytes, formatDuration, h, setText } from '../modules/utils.js';
import { createUrl, revokeUrl } from '../modules/object-url-manager.js';

const STATUS_LABEL = {
  reading: ['Reading…', 'busy'],
  ready: ['Ready', 'ready'],
  dirty: ['Edited', 'dirty'],
  busy: ['Working…', 'busy'],
  error: ['Error', 'error'],
  done: ['Saved', 'done'],
};

function ensureThumb(f) {
  if (f.thumbUrl || !f.cover) return;
  try {
    f.thumbUrl = createUrl(new Blob([f.cover.data], { type: f.cover.format }));
  } catch { /* ignore */ }
}

function renderRow(f) {
  const tr = h('tr', { 'data-id': f.id, tabindex: '0', 'aria-selected': String(state.selection.has(f.id)) });
  if (f.id === state.activeId) tr.classList.add('is-active');

  const check = h('input', { type: 'checkbox', 'aria-label': `Select ${f.name}` });
  check.checked = state.selection.has(f.id);
  check.addEventListener('click', (ev) => ev.stopPropagation());
  check.addEventListener('change', () => toggleSelected(f.id, check.checked));
  tr.append(h('td', {}, check));

  ensureThumb(f);
  const art = f.thumbUrl
    ? h('img', { class: 'file-thumb', src: f.thumbUrl, alt: '' })
    : h('span', { class: 'file-thumb--empty', 'aria-hidden': 'true' }, '♪');
  tr.append(h('td', {}, art));

  const nameCell = h('td', { class: 'cell-name', title: f.name }, f.name);
  tr.append(nameCell);
  tr.append(h('td', {}, f.format ? f.format.toUpperCase() : '…'));
  tr.append(h('td', {}, formatDuration(f.meta.duration)));
  tr.append(h('td', {}, f.meta.bitrate ? `${f.meta.bitrate} kbps` : '—'));
  tr.append(h('td', {}, f.meta.sampleRate ? `${(f.meta.sampleRate / 1000).toFixed(1)} kHz` : '—'));
  tr.append(h('td', {}, f.meta.channels ?? '—'));
  tr.append(h('td', {}, formatBytes(f.size)));

  const tagBits = [];
  if (f.meta.tagTypes?.length) tagBits.push(f.meta.tagTypes.join(', '));
  if (f.cover) tagBits.push('art');
  tr.append(h('td', {}, tagBits.join(' + ') || 'none'));

  const [label, kind] = STATUS_LABEL[f.status] ?? [f.status, 'ready'];
  const pill = h('span', { class: `status-pill status-pill--${kind}` }, f.error ? `${label}` : label);
  if (f.error) pill.title = f.error;
  const statusCell = h('td', {}, pill);
  if (f.plannedOp) statusCell.append(' ', h('small', { class: 'u-dim' }, f.plannedOp));
  if (f.warnings.length) {
    const warn = h('span', { title: f.warnings.join('\n'), 'aria-label': `${f.warnings.length} warnings` }, ' ⚠');
    statusCell.append(warn);
  }
  tr.append(statusCell);

  tr.addEventListener('click', () => setActive(f.id));
  tr.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') setActive(f.id);
    if (ev.key === ' ') { ev.preventDefault(); toggleSelected(f.id); }
    if (ev.key === 'Delete') { emit('request-remove-file', f.id); }
  });
  return tr;
}

function render() {
  const section = document.getElementById('files-section');
  const body = document.getElementById('file-table-body');
  const files = getOrderedFiles();
  section.hidden = files.length === 0;
  // refresh thumbs for covers that changed
  for (const f of files) {
    if (f.coverDirty && f.thumbUrl) { revokeUrl(f.thumbUrl); f.thumbUrl = null; }
  }
  body.replaceChildren(...files.map(renderRow));
  setText(document.getElementById('file-count'), files.length ? `(${files.length})` : '');
  updateToolbar();
}

function updateToolbar() {
  const selected = getSelectedFiles();
  document.getElementById('batch-edit-btn').disabled = selected.length < 2;
  document.getElementById('export-selected-btn').disabled = selected.length === 0;
  document.getElementById('export-zip-btn').disabled = selected.length === 0;
}

export function initFileList() {
  on('files-changed', render);
  on('file-updated', render);
  on('selection-changed', render);
  on('active-changed', render);

  document.getElementById('select-all-btn').addEventListener('click', () => {
    const files = getOrderedFiles();
    const allSelected = files.length > 0 && files.every((f) => state.selection.has(f.id));
    state.selection.clear();
    if (!allSelected) for (const f of files) state.selection.add(f.id);
    emit('selection-changed');
  });
}
