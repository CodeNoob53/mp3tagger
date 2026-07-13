/**
 * Technical info panel + WAV chunk list for the active file.
 */
import { on, getActiveFile } from '../modules/app-state.js';
import { formatBytes, formatDuration, h } from '../modules/utils.js';

const KNOWN_CHUNKS = new Set(['fmt ', 'data', 'LIST', 'bext', 'fact', 'cue ', 'smpl', 'id3 ', 'ID3 ']);

function render() {
  const f = getActiveFile();
  const dl = document.getElementById('tech-info');
  const wavWrap = document.getElementById('wav-chunks-wrap');
  if (!f) { dl.replaceChildren(); wavWrap.hidden = true; return; }

  const rows = [
    ['Container', f.meta.container ?? f.format.toUpperCase()],
    ['Codec', `${f.meta.codec ?? '—'}${f.meta.codecProfile ? ` (${f.meta.codecProfile})` : ''}`],
    ['Duration', formatDuration(f.meta.duration)],
    ['Bitrate', f.meta.bitrate ? `${f.meta.bitrate} kbps` : '—'],
    ['Sample rate', f.meta.sampleRate ? `${f.meta.sampleRate} Hz` : '—'],
    ['Channels', f.meta.channels ?? '—'],
    ['Bit depth', f.meta.bitsPerSample ? `${f.meta.bitsPerSample}-bit` : '—'],
    ['File size', formatBytes(f.size)],
    ['Tag types', f.meta.tagTypes?.join(', ') || 'none'],
    ['Lossless', f.meta.lossless ? 'yes' : 'no'],
  ];
  dl.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]));

  if (f.format === 'wav' && f.wav) {
    wavWrap.hidden = false;
    const list = document.getElementById('wav-chunks');
    list.replaceChildren(...f.wav.chunks.map((c) => {
      const label = c.id === 'LIST' && c.listType ? `LIST/${c.listType}` : c.id.trim();
      const known = KNOWN_CHUNKS.has(c.id);
      return h('li', { class: known ? 'chunk-known' : '' },
        `${label} — ${formatBytes(c.size)}${known ? '' : ' (unknown, preserved as-is)'}`);
    }));
    if (f.wav.bext) {
      list.append(h('li', {}, `bext description: "${f.wav.bext.description || '—'}" (read-only)`));
    }
  } else {
    wavWrap.hidden = true;
  }
}

export function initTechInfo() {
  on('active-changed', render);
  on('file-updated', render);
}
