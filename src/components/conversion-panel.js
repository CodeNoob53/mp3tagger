/**
 * Conversion panel: options depend on the active file's format.
 * Output keeps the current tag model (re-applied after conversion).
 */
import { on, getActiveFile, emit } from '../modules/app-state.js';
import { convert } from '../modules/conversion-service.js';
import { writeMp3Tags } from '../modules/mp3-tag-service.js';
import { writeWavTags } from '../modules/wav-tag-service.js';
import { getBuffer, WARN_FILE_BYTES } from '../modules/file-manager.js';
import { notify, reportError } from '../modules/notifications.js';
import { createUrl, revokeUrl } from '../modules/object-url-manager.js';
import { setText, formatBytes } from '../modules/utils.js';
import { confirmDialog } from './confirmation-dialog.js';

function q(id) { return document.getElementById(id); }

function render() {
  const f = getActiveFile();
  if (!f) return;
  const isMp3 = f.format === 'mp3';
  q('mp3-to-wav-opts').hidden = !isMp3;
  q('wav-to-mp3-opts').hidden = isMp3;
  q('convert-btn').textContent = isMp3 ? 'Convert to WAV' : 'Convert to MP3';
  setText(q('conversion-explain'), isMp3
    ? 'MP3 → WAV decodes the audio to uncompressed PCM. The WAV will be much larger, and the quality cannot exceed the source MP3 (data already discarded by MP3 encoding is gone). No additional loss is introduced.'
    : 'WAV → MP3 is lossy compression: some audio detail is permanently discarded. 320 kbps CBR (default) is transparent for most listeners.');
}

async function run() {
  const f = getActiveFile();
  if (!f || f.status === 'busy') return;
  const isMp3 = f.format === 'mp3';

  if (f.size > WARN_FILE_BYTES) {
    const ok = await confirmDialog('Large file', `"${f.name}" is ${formatBytes(f.size)}. Conversion may take a while and use a lot of memory. Continue?`, 'Convert');
    if (!ok) return;
  }

  /** @type {import('../modules/conversion-service.js').ConvertOptions} */
  const opts = isMp3
    ? {
        direction: 'mp3->wav',
        sampleRate: q('c-samplerate').value,
        bitDepth: Number(q('c-bitdepth').value) === 24 ? 24 : 16,
        channels: q('c-channels').value,
      }
    : {
        direction: 'wav->mp3',
        mode: q('c-mode').value,
        bitrate: Number(q('c-bitrate').value),
        vbrQuality: Number(q('c-vbrq').value),
      };

  f.status = 'busy';
  f.plannedOp = isMp3 ? 'Converting to WAV' : 'Converting to MP3';
  emit('file-updated', f.id);
  try {
    const data = new Uint8Array(await getBuffer(f));
    let out = await convert({ id: f.id, name: f.name, data }, opts);
    // re-apply the current tag model to the converted file
    try {
      if (opts.direction === 'wav->mp3') {
        out = await writeMp3Tags(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength), f.tags, {
          version: 3,
          cover: f.cover ? { mime: f.cover.format, data: f.cover.data } : undefined,
        });
      } else {
        out = writeWavTags(out, f.tags, {
          writeId3Chunk: true,
          infoEncoding: 'windows-1251',
          cover: f.cover ? { mime: f.cover.format, data: f.cover.data } : undefined,
        }).bytes;
      }
    } catch (tagErr) {
      notify.warning(`Converted, but tags could not be copied: ${tagErr.message}`);
    }
    const ext = opts.direction === 'mp3->wav' ? 'wav' : 'mp3';
    const base = f.name.replace(/\.[^.]+$/, '');
    revokeUrl(f.outputUrl);
    f.output = new Blob([out], { type: ext === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
    f.outputName = `${base}.${ext}`;
    f.outputUrl = createUrl(f.output);
    f.status = 'done';
    f.plannedOp = null;
    q('download-file-btn').disabled = false;
    notify.success(`Converted "${f.name}" → ${f.outputName} (${formatBytes(f.output.size)}). Press "Download result" to save it.`);
  } catch (err) {
    f.plannedOp = null;
    if (err?.name === 'AbortError') {
      f.status = 'ready';
      notify.info(`Conversion of "${f.name}" cancelled.`);
    } else {
      f.status = 'error';
      f.error = err instanceof Error ? err.message : String(err);
      reportError(err, { file: f.name, action: 'Conversion' });
    }
  }
  emit('file-updated', f.id);
}

export function initConversionPanel() {
  q('conversion-form').addEventListener('submit', (ev) => { ev.preventDefault(); run(); });
  q('c-mode').addEventListener('change', () => {
    const vbr = q('c-mode').value === 'vbr';
    q('c-cbr-field').hidden = vbr;
    q('c-vbr-field').hidden = !vbr;
  });
  on('active-changed', render);
}
