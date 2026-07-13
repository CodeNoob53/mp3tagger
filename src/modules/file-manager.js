/**
 * Imports files, detects real format, reads metadata, owns the AppFile model.
 * Original File objects are never mutated — edits produce new Blobs.
 */
import { state, emit } from './app-state.js';
import { readFileMetadata } from './audio-metadata-reader.js';
import { uid } from './utils.js';
import { revokeUrl, revokeAll } from './object-url-manager.js';
import { notify, reportError } from './notifications.js';

export const MAX_FILE_BYTES = 1.5 * 1024 * 1024 * 1024; // hard cap (WASM memory)
export const WARN_FILE_BYTES = 200 * 1024 * 1024;

/**
 * @typedef {Object} AppFile
 * @property {string} id
 * @property {File} file original file (never modified)
 * @property {string} name current (possibly template-renamed) output name
 * @property {'mp3'|'wav'} format
 * @property {number} size
 * @property {object} meta technical info
 * @property {import('./audio-metadata-reader.js').NormalizedTags} tags editable model
 * @property {import('./audio-metadata-reader.js').NormalizedTags} originalTags snapshot for revert
 * @property {{data: Uint8Array, format: string}|null} cover current cover (original or edited)
 * @property {boolean} coverDirty cover changed since load
 * @property {object|null} wav WAV chunk info
 * @property {string[]} warnings
 * @property {'reading'|'ready'|'dirty'|'busy'|'error'|'done'} status
 * @property {string|null} error
 * @property {Blob|null} output result of save/convert
 * @property {string|null} outputName
 * @property {string|null} outputUrl blob URL for download
 * @property {string|null} thumbUrl blob URL of cover thumbnail
 * @property {string|null} plannedOp e.g. 'Convert to WAV'
 */

/** Duplicate check: same name + size + lastModified. @param {File} f */
function isDuplicate(f) {
  for (const existing of state.files.values()) {
    if (existing.file.name === f.name && existing.file.size === f.size && existing.file.lastModified === f.lastModified) {
      return true;
    }
  }
  return false;
}

/**
 * Add files from input/drop. Unsupported and duplicate files are reported, not thrown.
 * @param {Iterable<File>} fileList
 */
export async function addFiles(fileList) {
  const files = [...fileList];
  for (const f of files) {
    if (isDuplicate(f)) {
      notify.warning(`"${f.name}" is already in the list — skipped.`);
      continue;
    }
    if (f.size > MAX_FILE_BYTES) {
      notify.error(`"${f.name}" is larger than 1.5 GB and cannot be processed in the browser.`);
      continue;
    }
    if (f.size === 0) {
      notify.error(`"${f.name}" is empty.`);
      continue;
    }
    const id = uid();
    /** @type {AppFile} */
    const appFile = {
      id, file: f, name: f.name, format: 'mp3', size: f.size,
      meta: {}, tags: {}, originalTags: {}, cover: null, coverDirty: false,
      wav: null, warnings: [], status: 'reading', error: null,
      output: null, outputName: null, outputUrl: null, thumbUrl: null, plannedOp: null,
    };
    state.files.set(id, appFile);
    state.order.push(id);
    emit('files-changed');
    if (f.size > WARN_FILE_BYTES) {
      notify.warning(`"${f.name}" is ${(f.size / 1048576).toFixed(0)} MB — operations may be slow and memory-hungry.`);
    }
    loadMetadata(appFile); // async, updates row when done
  }
}

/** @param {AppFile} appFile */
async function loadMetadata(appFile) {
  try {
    const head = new Uint8Array(await appFile.file.slice(0, 8192).arrayBuffer());
    const result = await readFileMetadata(appFile.file, head);
    appFile.format = result.format;
    appFile.meta = result.meta;
    appFile.tags = { ...result.tags };
    appFile.originalTags = { ...result.tags };
    appFile.cover = result.cover;
    appFile.wav = result.wav;
    appFile.warnings = result.warnings;
    appFile.status = 'ready';
    const declaredExt = appFile.file.name.split('.').pop()?.toLowerCase();
    if (declaredExt && declaredExt !== result.format) {
      appFile.warnings.push(`Extension ".${declaredExt}" does not match detected format (${result.format.toUpperCase()}). The real format is used.`);
      notify.warning(`"${appFile.file.name}": extension says .${declaredExt} but content is ${result.format.toUpperCase()}.`);
    }
  } catch (err) {
    appFile.status = 'error';
    appFile.error = err instanceof Error ? err.message : String(err);
    reportError(err, { file: appFile.file.name, action: 'Reading metadata' });
  }
  emit('file-updated', appFile.id);
  emit('files-changed');
}

/** Get the file's current bytes (original file). @param {AppFile} f */
export async function getBuffer(f) {
  return f.file.arrayBuffer();
}

/** Remove one file and free its resources. @param {string} id */
export function removeFile(id) {
  const f = state.files.get(id);
  if (!f) return;
  revokeUrl(f.outputUrl);
  revokeUrl(f.thumbUrl);
  state.files.delete(id);
  state.order = state.order.filter((x) => x !== id);
  state.selection.delete(id);
  if (state.activeId === id) { state.activeId = null; emit('active-changed', null); }
  emit('files-changed');
}

/** Clear the whole session and revoke every Blob URL. */
export function clearSession() {
  state.files.clear();
  state.order = [];
  state.selection.clear();
  state.activeId = null;
  revokeAll();
  emit('files-changed');
  emit('selection-changed');
  emit('active-changed', null);
}
