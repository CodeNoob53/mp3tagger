/**
 * Batch edit dialog: field inputs + clear checkboxes, preview table, apply.
 */
import { getSelectedFiles, emit } from '../modules/app-state.js';
import { BATCH_FIELDS, previewBatch, applyBatch } from '../modules/batch-editor.js';
import { sanitizeText } from '../modules/validation.js';
import { h, formatBytes } from '../modules/utils.js';
import { notify } from '../modules/notifications.js';

let lastPreview = null;
let lastFiles = null;

function q(id) { return document.getElementById(id); }

function buildFields() {
  const wrap = q('batch-fields');
  if (wrap.childElementCount) return;
  for (const field of BATCH_FIELDS) {
    const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    const div = h('div', { class: 'field' });
    const input = h('input', { type: 'text', id: `b-${field}`, autocomplete: 'off' });
    const clear = h('input', { type: 'checkbox', id: `bc-${field}`, 'aria-label': `Clear ${label} on all selected files` });
    const clearLabel = h('label', { class: 'check-label', for: `bc-${field}` });
    clearLabel.append(clear, ' clear');
    const mainLabel = h('label', { for: `b-${field}` }, label);
    div.append(mainLabel, input, clearLabel);
    wrap.append(div);
  }
}

function collectPlan() {
  const set = {};
  const clear = new Set();
  for (const field of BATCH_FIELDS) {
    const v = sanitizeText(q(`b-${field}`).value ?? '');
    if (v) set[field] = v;
    if (q(`bc-${field}`).checked) clear.add(field);
  }
  const nameSel = q('batch-name-template').value;
  const nameTemplate = nameSel === 'custom' ? sanitizeText(q('batch-name-custom').value) : nameSel;
  return {
    set,
    clear,
    autoNumber: q('batch-autonumber').checked,
    titleTemplate: sanitizeText(q('batch-title-template').value) || undefined,
    nameTemplate: nameTemplate || undefined,
  };
}

function renderPreview(files, preview) {
  const table = q('batch-preview-table');
  const head = h('tr', {},
    h('th', { scope: 'col' }, 'File'),
    h('th', { scope: 'col' }, 'Changes'),
    h('th', { scope: 'col' }, 'New name'),
    h('th', { scope: 'col' }, 'Size'));
  const rows = preview.map((row, i) => {
    const tr = h('tr', {});
    tr.append(h('td', { class: 'cell-name', title: row.name }, row.name));
    const changes = h('td', {});
    if (row.changes.length === 0) changes.append(h('span', { class: 'u-dim' }, 'no changes'));
    for (const c of row.changes) {
      changes.append(h('div', { class: 'changed' }, `${c.field}: ${c.from ? `"${c.from}" → ` : ''}"${c.to}"`));
    }
    for (const conflict of row.conflicts) {
      changes.append(h('div', { class: 'conflict' }, `⚠ ${conflict}`));
    }
    tr.append(changes);
    tr.append(h('td', {}, row.newName ?? '—'));
    tr.append(h('td', {}, formatBytes(files[i].size)));
    return tr;
  });
  table.replaceChildren(h('thead', {}, head), h('tbody', {}, ...rows));
  q('batch-preview').hidden = false;
}

export function initBatchPanel() {
  const dialog = q('batch-dialog');
  buildFields();

  q('batch-edit-btn').addEventListener('click', () => {
    const files = getSelectedFiles();
    if (files.length < 2) return;
    lastPreview = null;
    q('batch-preview').hidden = true;
    dialog.showModal();
  });

  q('batch-name-template').addEventListener('change', () => {
    q('batch-name-custom').hidden = q('batch-name-template').value !== 'custom';
  });

  q('batch-preview-btn').addEventListener('click', () => {
    const files = getSelectedFiles();
    lastFiles = files;
    lastPreview = previewBatch(files, collectPlan());
    renderPreview(files, lastPreview);
  });

  q('batch-apply-btn').addEventListener('click', () => {
    if (!lastPreview || !lastFiles) return;
    const changed = applyBatch(lastFiles, lastPreview);
    notify.success(`Batch applied: ${changed} of ${lastFiles.length} files updated. Open each file and press "Save tags", or use "Export selected" to save all.`);
    dialog.close();
    emit('files-changed');
    emit('active-changed', null);
  });
}
