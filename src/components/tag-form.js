/**
 * Tag editing form: loads the active file's model, validates, saves.
 */
import { on, getActiveFile, emit } from '../modules/app-state.js';
import { validateTags, sanitizeText, sanitizeMultiline } from '../modules/validation.js';
import { writeMp3Tags } from '../modules/mp3-tag-service.js';
import { writeWavTags, WAV_FIELD_SUPPORT } from '../modules/wav-tag-service.js';
import { getBuffer } from '../modules/file-manager.js';
import { notify, reportError } from '../modules/notifications.js';
import { downloadBlob } from '../modules/download-manager.js';
import { setText } from '../modules/utils.js';
import { createUrl, revokeUrl } from '../modules/object-url-manager.js';

const FIELDS = [
  'title', 'artist', 'album', 'albumArtist', 'track', 'totalTracks', 'disc', 'totalDiscs',
  'year', 'genre', 'composer', 'comment', 'copyright', 'publisher', 'encodedBy', 'bpm',
  'isrc', 'language', 'lyrics', 'url', 'grouping', 'subtitle', 'conductor', 'remixer',
  'originalArtist', 'originalAlbum', 'mood', 'rating',
];
const MULTILINE = new Set(['comment', 'lyrics']);

let form, output;

function el(field) { return document.getElementById(`f-${field}`); }

function readForm() {
  const tags = {};
  for (const f of FIELDS) {
    const input = el(f);
    if (!input) continue;
    const raw = input.value ?? '';
    tags[f] = MULTILINE.has(f) ? sanitizeMultiline(raw) : sanitizeText(raw);
  }
  return tags;
}

function fillForm(tags) {
  for (const f of FIELDS) {
    const input = el(f);
    if (input) input.value = tags[f] ?? '';
  }
}

/** Grey out / annotate fields WAV cannot store. @param {'mp3'|'wav'} format @param {boolean} id3ChunkOn */
function applyFormatAffordances(format, id3ChunkOn) {
  const note = document.getElementById('wav-compat-note');
  document.getElementById('mp3-options-fieldset').hidden = format !== 'mp3';
  if (format === 'mp3') {
    note.hidden = true;
    for (const f of FIELDS) el(f)?.removeAttribute('disabled');
    return;
  }
  const limited = [];
  const dropped = [];
  for (const f of FIELDS) {
    const input = el(f);
    if (!input) continue;
    const support = WAV_FIELD_SUPPORT[f];
    const usable = support?.info || id3ChunkOn;
    input.disabled = !usable;
    if (!support?.info && !id3ChunkOn) dropped.push(f);
    else if (support?.level === 'limited') limited.push(f);
  }
  note.hidden = false;
  note.textContent =
    'WAV metadata support is limited. Fields marked high/limited are stored as standard RIFF INFO. '
    + (id3ChunkOn
      ? 'Remaining fields go into an experimental id3 chunk (readable by VLC/foobar2000/MusicBee, ignored by Windows).'
      : `Fields not storable in RIFF INFO are disabled: ${dropped.join(', ')}. Enable the experimental id3 chunk (below the cover) or convert to MP3/FLAC to keep them.`);
}

async function save() {
  const f = getActiveFile();
  if (!f) return;
  const tags = readForm();
  const { ok, errors } = validateTags(tags);
  for (const field of FIELDS) el(field)?.setAttribute('aria-invalid', String(!!errors[field]));
  if (!ok) {
    setText(output, Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join('\n'));
    notify.error('Please fix the highlighted fields.');
    return;
  }
  setText(output, '');
  // mp3tag.js drops astral-plane characters (emoji) — warn honestly
  if (f.format === 'mp3' && Object.values(tags).some((v) => /[\u{10000}-\u{10FFFF}]/u.test(v ?? ''))) {
    notify.warning('Emoji and other astral-plane characters are not supported by the tag writer and will be dropped.');
  }
  f.tags = tags;
  f.status = 'busy';
  emit('file-updated', f.id);
  try {
    const buffer = await getBuffer(f);
    let bytes;
    if (f.format === 'mp3') {
      const version = Number(document.getElementById('f-id3version').value) === 4 ? 4 : 3;
      let cover;
      if (f.coverDirty) cover = f.cover ? { mime: f.cover.format, data: f.cover.data } : null;
      bytes = await writeMp3Tags(buffer, tags, { version, cover });
    } else {
      const writeId3Chunk = document.getElementById('wav-id3-chunk').checked;
      const cover = f.cover ? { mime: f.cover.format, data: f.cover.data } : null;
      const result = writeWavTags(new Uint8Array(buffer), tags, { writeId3Chunk, cover });
      bytes = result.bytes;
      if (result.skipped.length) {
        notify.warning(`Not stored in WAV: ${result.skipped.join(', ')}. Enable the id3 chunk option or convert to keep these.`);
      }
      if (result.nonAsciiInfo) {
        notify.warning('RIFF INFO has no standard Unicode encoding: non-Latin text is saved as UTF-8 and may look garbled in players that assume Latin-1 (e.g. some Windows tools). The experimental id3 chunk stores proper Unicode.');
      }
    }
    revokeUrl(f.outputUrl);
    f.output = new Blob([bytes], { type: f.format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
    f.outputName = f.name;
    f.outputUrl = createUrl(f.output);
    f.status = 'done';
    f.coverDirty = false;
    document.getElementById('download-file-btn').disabled = false;
    notify.success(`Tags saved for "${f.name}" (${(f.output.size / 1048576).toFixed(2)} MB). Audio was not re-encoded.`);
  } catch (err) {
    f.status = 'error';
    f.error = err instanceof Error ? err.message : String(err);
    reportError(err, { file: f.name, action: 'Saving tags' });
  }
  emit('file-updated', f.id);
}

function render() {
  const f = getActiveFile();
  const section = document.getElementById('editor-section');
  section.hidden = !f;
  if (!f) return;
  setText(document.getElementById('editing-filename'), f.name);
  fillForm(f.tags);
  setText(output, '');
  for (const field of FIELDS) el(field)?.setAttribute('aria-invalid', 'false');
  const id3ChunkOn = document.getElementById('wav-id3-chunk').checked;
  applyFormatAffordances(f.format, f.format === 'wav' && id3ChunkOn);
  document.getElementById('download-file-btn').disabled = !f.output;
}

export function initTagForm() {
  form = document.getElementById('tag-form');
  output = document.getElementById('validation-output');

  form.addEventListener('submit', (ev) => { ev.preventDefault(); save(); });
  form.addEventListener('input', () => {
    const f = getActiveFile();
    if (f && f.status !== 'busy') { f.status = 'dirty'; }
  });

  document.getElementById('revert-tags-btn').addEventListener('click', () => {
    const f = getActiveFile();
    if (!f) return;
    f.tags = { ...f.originalTags };
    f.status = 'ready';
    render();
    emit('file-updated', f.id);
    notify.info('Fields reverted to the values read from the file.');
  });

  document.getElementById('download-file-btn').addEventListener('click', () => {
    const f = getActiveFile();
    if (f?.output) downloadBlob(f.output, f.outputName ?? f.name);
  });

  document.getElementById('wav-id3-chunk').addEventListener('change', render);

  on('active-changed', render);
}
