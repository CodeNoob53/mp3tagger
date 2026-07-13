/**
 * Cover art: preview, add/replace (file, drop, paste), crop dialog, compression.
 */
import { on, getActiveFile, emit, state } from '../modules/app-state.js';
import { loadImage, imageFromDataTransfer } from '../modules/image-loader.js';
import { Cropper } from '../modules/image-cropper.js';
import { renderCrop, compressToBudget, encodePlain, MIN_QUALITY } from '../modules/image-compressor.js';
import { coverBudget } from '../modules/validation.js';
import { formatBytes, setText, debounce } from '../modules/utils.js';
import { notify, reportError } from '../modules/notifications.js';
import { createUrl, revokeUrl } from '../modules/object-url-manager.js';
import { downloadBlob } from '../modules/download-manager.js';
import { confirmDialog } from './confirmation-dialog.js';

let previewUrl = null;
let cropper = null;
let pendingBitmap = null;
let pendingSource = null; // { blob, type }

function q(id) { return document.getElementById(id); }

function renderPreview() {
  const f = getActiveFile();
  const img = q('artwork-img');
  const placeholder = q('artwork-placeholder');
  const info = q('artwork-info');
  revokeUrl(previewUrl);
  previewUrl = null;

  const isWav = f?.format === 'wav';
  q('wav-artwork-note').hidden = !isWav;
  q('wav-id3-chunk-label').hidden = !isWav;

  if (!f || !f.cover) {
    img.hidden = true;
    img.removeAttribute('src');
    placeholder.hidden = false;
    setText(info, f ? 'No embedded cover.' : '');
    q('artwork-edit-btn').disabled = true;
    q('artwork-remove-btn').disabled = true;
    q('artwork-export-btn').disabled = true;
    return;
  }
  const blob = new Blob([f.cover.data], { type: f.cover.format });
  previewUrl = createUrl(blob);
  img.src = previewUrl;
  img.alt = `Cover art of ${f.tags.title || f.name}`;
  img.hidden = false;
  placeholder.hidden = true;
  setText(info, `${f.cover.format} · ${formatBytes(f.cover.data.byteLength)}${f.coverDirty ? ' · edited, not saved yet' : ''}`);
  q('artwork-edit-btn').disabled = false;
  q('artwork-remove-btn').disabled = false;
  q('artwork-export-btn').disabled = false;
}

async function acceptImage(blob) {
  const f = getActiveFile();
  if (!f) return;
  try {
    const { bitmap, blob: src, type } = await loadImage(blob);
    pendingBitmap?.close?.();
    pendingBitmap = bitmap;
    pendingSource = { blob: src, type };
    openCropDialog();
  } catch (err) {
    reportError(err, { action: 'Loading image' });
  }
}

/* ---------- crop dialog ---------- */

const updateStats = debounce(async () => {
  const f = getActiveFile();
  if (!f || !cropper) return;
  const statsEl = q('crop-stats');
  const outSize = resolveOutSize();
  const canvas = renderCrop(pendingBitmap, cropper.t, cropper.stageSize, Math.min(outSize, 500));
  const { blob } = await encodePlain(canvas, 'image/jpeg');
  const est = Math.round(blob.size * (outSize / Math.min(outSize, 500)) ** 1.6);
  const budget = currentBudget(f);
  setText(statsEl,
    `Source: ${pendingBitmap.width}×${pendingBitmap.height}, ${formatBytes(pendingSource.blob.size)}. `
    + `Output: ${outSize}×${outSize}, est. ${formatBytes(est)} (limit ${formatBytes(budget.hardLimit)}). `
    + `Audio file: ${formatBytes(f.size)} → est. ${formatBytes(f.size + est)}.`);
}, 300);

function resolveOutSize() {
  const v = q('crop-size').value;
  if (v !== 'original') return Number(v);
  return Math.min(Math.max(pendingBitmap.width, pendingBitmap.height), 3000);
}

function currentBudget(f) {
  const mode = q('crop-limit').value;
  return coverBudget(f.size, mode === 'auto' ? 'auto' : Number(mode));
}

function openCropDialog() {
  const dialog = q('artwork-dialog');
  const canvas = q('cropper-canvas');
  cropper?.destroy();
  cropper = new Cropper(canvas, pendingBitmap);
  cropper.onChange = updateStats;
  if (q('crop-size').value === 'original') q('crop-size').value = '500';
  if (pendingBitmap.width > 3000 || pendingBitmap.height > 3000) {
    notify.warning('Very large image — "Original resolution" output may produce a huge cover.');
  }
  q('crop-zoom').value = cropper.zoomSliderValue();
  dialog.showModal();
  cropper.draw();
  updateStats();
}

async function applyCrop() {
  const f = getActiveFile();
  if (!f || !cropper) return;
  const outSize = resolveOutSize();
  const budget = currentBudget(f);
  const applyBtn = q('crop-apply-btn');
  applyBtn.disabled = true;
  setText(q('crop-stats'), 'Compressing…');
  try {
    const canvas = renderCrop(pendingBitmap, cropper.t, cropper.stageSize, outSize);
    const before = pendingSource.blob.size;
    const result = await compressToBudget(canvas, pendingBitmap, { t: cropper.t, stageSize: cropper.stageSize }, budget.hardLimit, { aggressive: budget.aggressive });
    if (result.tooLow) {
      setText(q('crop-stats'),
        `Cannot fit the cover under ${formatBytes(budget.hardLimit)} even at minimum quality (${Math.round(MIN_QUALITY * 100)}%). `
        + 'Pick a smaller output size or raise the limit.');
      notify.warning('Compression stopped — the result would look too bad. Adjust size or limit.');
      return;
    }
    const data = new Uint8Array(await result.blob.arrayBuffer());
    const growthPct = (result.blob.size / f.size) * 100;
    if (growthPct > 5) {
      notify.warning(`Cover adds ${growthPct.toFixed(1)}% to the audio file size.`);
    }
    f.cover = { data, format: 'image/jpeg' };
    f.coverDirty = true;
    f.status = 'dirty';
    const savedPct = before > 0 ? Math.round((1 - result.blob.size / before) * 100) : 0;
    notify.success(
      `Cover set: ${result.width}×${result.width} JPEG, ${formatBytes(result.blob.size)} `
      + `(${savedPct >= 0 ? `${savedPct}% smaller than` : 'larger than'} source, quality ${(result.quality * 100).toFixed(0)}%). Save tags to embed it.`);
    q('artwork-dialog').close();
    renderPreview();
    emit('file-updated', f.id);
  } catch (err) {
    reportError(err, { file: f.name, action: 'Processing cover' });
  } finally {
    applyBtn.disabled = false;
  }
}

/* ---------- init ---------- */

export function initArtworkEditor() {
  const preview = q('artwork-preview');
  const input = q('artwork-input');

  const pick = () => input.click();
  q('artwork-add-btn').addEventListener('click', pick);
  preview.addEventListener('click', pick);
  preview.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); }
  });
  input.addEventListener('change', () => {
    if (input.files?.[0]) acceptImage(input.files[0]);
    input.value = '';
  });

  preview.addEventListener('dragover', (ev) => { ev.preventDefault(); preview.classList.add('is-dragover'); });
  preview.addEventListener('dragleave', () => preview.classList.remove('is-dragover'));
  preview.addEventListener('drop', (ev) => {
    ev.preventDefault();
    preview.classList.remove('is-dragover');
    const file = imageFromDataTransfer(ev.dataTransfer);
    if (file) acceptImage(file);
    else notify.warning('Drop a JPEG, PNG or WebP image.');
  });

  document.addEventListener('paste', (ev) => {
    if (document.getElementById('editor-section').hidden) return;
    const target = ev.target;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const file = imageFromDataTransfer(ev.clipboardData);
    if (file) { ev.preventDefault(); acceptImage(file); }
  });

  q('artwork-edit-btn').addEventListener('click', async () => {
    const f = getActiveFile();
    if (!f?.cover) return;
    await acceptImage(new Blob([f.cover.data], { type: f.cover.format }));
  });

  q('artwork-remove-btn').addEventListener('click', async () => {
    const f = getActiveFile();
    if (!f?.cover) return;
    const ok = await confirmDialog('Remove cover art?', `The embedded cover will be removed from "${f.name}" on the next save.`, 'Remove');
    if (!ok) return;
    f.cover = null;
    f.coverDirty = true;
    f.status = 'dirty';
    renderPreview();
    emit('file-updated', f.id);
  });

  q('artwork-export-btn').addEventListener('click', () => {
    const f = getActiveFile();
    if (!f?.cover) return;
    const ext = f.cover.format.includes('png') ? 'png' : 'jpg';
    downloadBlob(new Blob([f.cover.data], { type: f.cover.format }), `cover.${ext}`);
  });

  // crop dialog controls
  q('crop-cover-btn').addEventListener('click', () => { cropper?.fit('cover'); q('crop-zoom').value = 0; });
  q('crop-contain-btn').addEventListener('click', () => { cropper?.fit('contain'); q('crop-zoom').value = 0; });
  q('crop-rotate-btn').addEventListener('click', () => cropper?.rotate90());
  q('crop-center-btn').addEventListener('click', () => cropper?.center());
  q('crop-reset-btn').addEventListener('click', () => { cropper?.reset(); q('crop-zoom').value = 0; });
  q('crop-zoom').addEventListener('input', (ev) => cropper?.setZoomSlider(Number(ev.target.value)));
  q('crop-size').addEventListener('change', updateStats);
  q('crop-limit').addEventListener('change', () => {
    state.settings.coverLimitMode = q('crop-limit').value;
    updateStats();
  });
  q('crop-apply-btn').addEventListener('click', applyCrop);
  q('crop-cancel-btn').addEventListener('click', () => q('artwork-dialog').close());
  q('artwork-dialog').addEventListener('close', () => {
    cropper?.destroy();
    cropper = null;
  });

  on('active-changed', renderPreview);
  on('file-updated', () => renderPreview());
}
