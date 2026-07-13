/**
 * App entry point: styles, component wiring, export actions, session cleanup.
 */
import './styles/reset.css';
import './styles/variables.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/utilities.css';
import './styles/responsive.css';

import { initTheme } from './modules/theme-manager.js';
import { initDropZone } from './components/file-drop-zone.js';
import { initFileList } from './components/file-list.js';
import { initTagForm } from './components/tag-form.js';
import { initArtworkEditor } from './components/artwork-editor.js';
import { initTechInfo } from './components/tech-info.js';
import { initConversionPanel } from './components/conversion-panel.js';
import { initProgressPanel } from './components/progress-panel.js';
import { initConfirmDialog, confirmDialog } from './components/confirmation-dialog.js';
import { initBatchPanel } from './components/batch-panel.js';
import { initEditorTabs } from './components/editor-tabs.js';
import { initStepIndicator } from './components/step-indicator.js';

import { on, getSelectedFiles, emit } from './modules/app-state.js';
import { clearSession, removeFile, getBuffer } from './modules/file-manager.js';
import { writeMp3Tags } from './modules/mp3-tag-service.js';
import { writeWavTags } from './modules/wav-tag-service.js';
import { downloadBlob, downloadZip } from './modules/download-manager.js';
import { uniquifyNames } from './modules/filename-templates.js';
import { notify, reportError } from './modules/notifications.js';
import { revokeAll, createUrl, revokeUrl } from './modules/object-url-manager.js';

/**
 * Produce the output blob for a file: existing output, or write current tags.
 * @param {import('./modules/file-manager.js').AppFile} f
 * @returns {Promise<{ blob: Blob, name: string }>}
 */
async function ensureOutput(f) {
  const tagsChanged = JSON.stringify(f.tags) !== JSON.stringify(f.originalTags) || f.coverDirty;
  if (f.output && !tagsChanged) return { blob: f.output, name: f.outputName ?? f.name };
  const buffer = await getBuffer(f);
  let bytes;
  if (f.format === 'mp3') {
    let cover;
    if (f.coverDirty) cover = f.cover ? { mime: f.cover.format, data: f.cover.data } : null;
    const version = Number(document.getElementById('f-id3version')?.value) === 4 ? 4 : 3;
    bytes = await writeMp3Tags(buffer, f.tags, { version, cover });
  } else {
    const writeId3Chunk = document.getElementById('wav-id3-chunk').checked;
    const cover = f.cover ? { mime: f.cover.format, data: f.cover.data } : null;
    bytes = writeWavTags(new Uint8Array(buffer), f.tags, { writeId3Chunk, cover }).bytes;
  }
  revokeUrl(f.outputUrl);
  f.output = new Blob([bytes], { type: f.format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
  f.outputName = f.name;
  f.outputUrl = createUrl(f.output);
  f.status = 'done';
  f.coverDirty = false;
  emit('file-updated', f.id);
  return { blob: f.output, name: f.outputName };
}

async function exportSelected(asZip) {
  const files = getSelectedFiles();
  if (files.length === 0) return;
  const entries = [];
  for (const f of files) {
    try {
      entries.push(await ensureOutput(f));
    } catch (err) {
      reportError(err, { file: f.name, action: 'Preparing export' });
    }
  }
  if (entries.length === 0) return;
  if (asZip) {
    try {
      await downloadZip(entries, `aurela-export-${new Date().toISOString().slice(0, 10)}.zip`);
      notify.success(`ZIP with ${entries.length} file(s) is downloading.`);
    } catch (err) {
      reportError(err, { action: 'ZIP export' });
    }
  } else {
    const names = uniquifyNames(entries.map((e) => e.name));
    entries.forEach((e, i) => downloadBlob(e.blob, names[i]));
    notify.success(`${entries.length} download(s) started.`);
  }
}

function init() {
  initTheme(document.getElementById('theme-toggle'));
  initConfirmDialog();
  initDropZone();
  initFileList();
  initTagForm();
  initArtworkEditor();
  initTechInfo();
  initConversionPanel();
  initProgressPanel();
  initBatchPanel();
  initEditorTabs();
  initStepIndicator();

  document.getElementById('clear-session-btn').addEventListener('click', async () => {
    const ok = await confirmDialog('Clear session?', 'All files, edits and prepared downloads will be discarded. Files on your disk are not affected.', 'Clear');
    if (ok) {
      clearSession();
      notify.info('Session cleared.');
    }
  });

  document.getElementById('export-selected-btn').addEventListener('click', () => exportSelected(false));
  document.getElementById('export-zip-btn').addEventListener('click', () => exportSelected(true));

  on('request-remove-file', (id) => removeFile(id));

  window.addEventListener('pagehide', () => revokeAll());
  window.addEventListener('beforeunload', (ev) => {
    // warn if there is unsaved work or a running conversion
    const busy = [...document.querySelectorAll('.status-pill--busy')].length > 0;
    if (busy) { ev.preventDefault(); ev.returnValue = ''; }
  });
}

init();
