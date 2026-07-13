/**
 * Writes ID3v2 tags into MP3 files using mp3tag.js (lazy-loaded).
 * The MPEG audio stream is never re-encoded — mp3tag.js replaces only the
 * tag block and copies audio bytes verbatim. Frames we do not manage
 * (present in the existing tag) are preserved.
 */
import { normalizeIsrc } from './validation.js';

let mp3tagPromise = null;
function loadMp3Tag() {
  mp3tagPromise ??= import('mp3tag.js').then((m) => m.default);
  return mp3tagPromise;
}

/**
 * Map of normalized field -> ID3v2.3/2.4 text frame id.
 * Fields with special shapes (comment, lyrics, url, rating, track, disc, year, mood)
 * are handled separately in buildFrames().
 */
const TEXT_FRAMES = {
  title: 'TIT2',
  artist: 'TPE1',
  album: 'TALB',
  albumArtist: 'TPE2',
  genre: 'TCON',
  composer: 'TCOM',
  copyright: 'TCOP',
  publisher: 'TPUB',
  encodedBy: 'TENC',
  bpm: 'TBPM',
  isrc: 'TSRC',
  language: 'TLAN',
  grouping: 'TIT1',
  subtitle: 'TIT3',
  conductor: 'TPE3',
  remixer: 'TPE4',
  originalArtist: 'TOPE',
  originalAlbum: 'TOAL',
};

/** Convert 0–5 stars to POPM 0–255 (Windows Media Player mapping). @param {number} stars */
export function starsToPopm(stars) {
  return [0, 1, 64, 128, 196, 255][Math.max(0, Math.min(5, stars))] ?? 0;
}

/** Convert POPM 0–255 back to 0–5 stars. @param {number} popm */
export function popmToStars(popm) {
  if (popm <= 0) return 0;
  if (popm < 32) return 1;
  if (popm < 96) return 2;
  if (popm < 160) return 3;
  if (popm < 224) return 4;
  return 5;
}

/**
 * Apply the normalized tag model onto an mp3tag.js `tags.v2` object in place.
 * Empty string means "remove the frame".
 * @param {object} v2 mp3tag.js v2 tag object (mutated)
 * @param {import('./audio-metadata-reader.js').NormalizedTags} t
 * @param {3|4} version target ID3v2 minor version
 * @param {{ mime: string, data: Uint8Array }|null} cover
 */
export function applyModelToV2(v2, t, version, cover) {
  const setOrDelete = (frame, value) => {
    if (value) v2[frame] = value; else delete v2[frame];
  };
  for (const [field, frame] of Object.entries(TEXT_FRAMES)) {
    let value = t[field] ?? '';
    if (field === 'isrc') value = normalizeIsrc(value);
    setOrDelete(frame, value);
  }
  // track / disc as "n/total"
  const trck = t.track ? (t.totalTracks ? `${t.track}/${t.totalTracks}` : t.track) : '';
  setOrDelete('TRCK', trck);
  const tpos = t.disc ? (t.totalDiscs ? `${t.disc}/${t.totalDiscs}` : t.disc) : '';
  setOrDelete('TPOS', tpos);
  // year: TYER (v2.3) vs TDRC (v2.4)
  if (version === 4) {
    delete v2.TYER;
    setOrDelete('TDRC', t.year ?? '');
  } else {
    delete v2.TDRC;
    setOrDelete('TYER', t.year ?? '');
  }
  // mood: TMOO is v2.4-only; keep it portable via TXXX for v2.3
  const txxx = (v2.TXXX ?? []).filter((x) => x.description !== 'MOOD');
  if (t.mood) {
    if (version === 4) { setOrDelete('TMOO', t.mood); }
    else { delete v2.TMOO; txxx.push({ description: 'MOOD', text: t.mood }); }
  } else { delete v2.TMOO; }
  if (txxx.length) v2.TXXX = txxx; else delete v2.TXXX;
  // comment
  if (t.comment) {
    v2.COMM = [{ language: (t.language || 'eng').toLowerCase(), descriptor: '', text: t.comment }];
  } else { delete v2.COMM; }
  // lyrics
  if (t.lyrics) {
    v2.USLT = [{ language: (t.language || 'eng').toLowerCase(), descriptor: '', text: t.lyrics }];
  } else { delete v2.USLT; }
  // url
  if (t.url) { v2.WXXX = [{ description: '', url: t.url }]; } else { delete v2.WXXX; }
  // rating
  if (t.rating !== '' && t.rating !== undefined && t.rating !== null) {
    v2.POPM = [{ email: 'rating@aurela.app', rating: starsToPopm(Number(t.rating)), counter: 0 }];
  } else { delete v2.POPM; }
  // cover
  if (cover) {
    v2.APIC = [{ format: cover.mime, type: 3, description: '', data: Array.from(cover.data) }];
  } else if (cover === null) {
    delete v2.APIC;
  }
}

/**
 * Write tags into an MP3 buffer.
 * @param {ArrayBuffer} buffer original file bytes
 * @param {import('./audio-metadata-reader.js').NormalizedTags} tagModel
 * @param {{ version?: 3|4, cover?: { mime: string, data: Uint8Array }|null }} [opts]
 *   cover: undefined = keep existing APIC, null = remove, object = replace
 * @returns {Promise<Uint8Array>} new file bytes
 */
export async function writeMp3Tags(buffer, tagModel, opts = {}) {
  const MP3Tag = await loadMp3Tag();
  const version = opts.version ?? 3;
  const tagger = new MP3Tag(buffer);
  tagger.read();
  if (tagger.error) throw new Error(`Could not parse existing tags: ${tagger.error}`);
  tagger.tags.v2 = tagger.tags.v2 ?? {};

  let cover = opts.cover;
  if (cover === undefined) {
    // keep existing APIC untouched
    cover = undefined;
    applyModelToV2(tagger.tags.v2, tagModel, version, undefined);
  } else {
    applyModelToV2(tagger.tags.v2, tagModel, version, cover);
  }

  const out = tagger.save({ strict: true, id3v1: { include: false }, id3v2: { include: true, version, unsynch: false } });
  if (tagger.error) throw new Error(`Tag write failed: ${tagger.error}`);
  return new Uint8Array(out);
}

/**
 * Verify a written file round-trips (used by tests and after-save check).
 * @param {Uint8Array} bytes
 * @returns {Promise<object>} parsed v2 tags
 */
export async function readBackV2(bytes) {
  const MP3Tag = await loadMp3Tag();
  const tagger = new MP3Tag(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  tagger.read();
  if (tagger.error) throw new Error(tagger.error);
  return tagger.tags;
}
