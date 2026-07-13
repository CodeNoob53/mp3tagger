/**
 * WAV metadata service — maps the normalized tag model onto RIFF LIST-INFO
 * fields and (optionally) an experimental `id3 ` chunk.
 * `fmt `, `data`, `bext` and all unknown chunks are preserved byte-for-byte.
 */
import { writeWavMetadata, readInfo } from './riff.js';
import { buildId3v23Tag } from './id3-encoder.js';
import { normalizeIsrc } from './validation.js';

/**
 * Compatibility levels for WAV fields:
 *  - high: standard INFO id, widely read (VLC, foobar2000, MusicBee, some Explorer fields)
 *  - limited: standard-ish INFO id, few players show it
 *  - experimental: only via the non-standard `id3 ` chunk
 */
export const WAV_FIELD_SUPPORT = {
  title: { level: 'high', info: 'INAM' },
  artist: { level: 'high', info: 'IART' },
  album: { level: 'high', info: 'IPRD' },
  genre: { level: 'high', info: 'IGNR' },
  year: { level: 'high', info: 'ICRD' },
  comment: { level: 'high', info: 'ICMT' },
  copyright: { level: 'high', info: 'ICOP' },
  track: { level: 'limited', info: 'ITRK' },
  encodedBy: { level: 'limited', info: 'ISFT' },
  subtitle: { level: 'limited', info: 'ISBJ' },
  isrc: { level: 'limited', info: 'ISRC' },
  language: { level: 'limited', info: 'ILNG' },
  composer: { level: 'limited', info: 'IMUS' },
  publisher: { level: 'limited', info: 'ICMS' },
  albumArtist: { level: 'experimental' },
  totalTracks: { level: 'experimental' },
  disc: { level: 'experimental' },
  totalDiscs: { level: 'experimental' },
  bpm: { level: 'experimental' },
  lyrics: { level: 'experimental' },
  url: { level: 'experimental' },
  grouping: { level: 'experimental' },
  conductor: { level: 'experimental' },
  remixer: { level: 'experimental' },
  originalArtist: { level: 'experimental' },
  originalAlbum: { level: 'experimental' },
  mood: { level: 'experimental' },
  rating: { level: 'experimental' },
};

/** Fields that can be stored in LIST-INFO at all. */
export function wavSupportedFields() {
  return Object.entries(WAV_FIELD_SUPPORT)
    .filter(([, v]) => v.info)
    .map(([k]) => k);
}

/**
 * Build the INFO map from the normalized model.
 * @param {import('./audio-metadata-reader.js').NormalizedTags} t
 * @returns {Record<string,string>}
 */
export function modelToInfo(t) {
  const out = {};
  for (const [field, def] of Object.entries(WAV_FIELD_SUPPORT)) {
    if (!def.info) continue;
    let value = t[field] ?? '';
    if (field === 'isrc') value = normalizeIsrc(value);
    if (value) out[def.info] = String(value);
  }
  return out;
}

/**
 * ID3 frames for the experimental `id3 ` chunk (gives WAV the fields INFO lacks).
 * @param {import('./audio-metadata-reader.js').NormalizedTags} t
 */
function modelToId3Frames(t) {
  const f = {};
  if (t.title) f.TIT2 = t.title;
  if (t.artist) f.TPE1 = t.artist;
  if (t.album) f.TALB = t.album;
  if (t.albumArtist) f.TPE2 = t.albumArtist;
  if (t.genre) f.TCON = t.genre;
  if (t.year) f.TYER = t.year;
  if (t.track) f.TRCK = t.totalTracks ? `${t.track}/${t.totalTracks}` : t.track;
  if (t.disc) f.TPOS = t.totalDiscs ? `${t.disc}/${t.totalDiscs}` : t.disc;
  if (t.composer) f.TCOM = t.composer;
  if (t.bpm) f.TBPM = t.bpm;
  if (t.isrc) f.TSRC = normalizeIsrc(t.isrc);
  if (t.publisher) f.TPUB = t.publisher;
  if (t.copyright) f.TCOP = t.copyright;
  if (t.conductor) f.TPE3 = t.conductor;
  if (t.remixer) f.TPE4 = t.remixer;
  if (t.grouping) f.TIT1 = t.grouping;
  if (t.subtitle) f.TIT3 = t.subtitle;
  if (t.originalArtist) f.TOPE = t.originalArtist;
  if (t.originalAlbum) f.TOAL = t.originalAlbum;
  if (t.language) f.TLAN = t.language;
  if (t.encodedBy) f.TENC = t.encodedBy;
  return f;
}

/**
 * Write WAV metadata.
 * @param {Uint8Array} u8 original file
 * @param {import('./audio-metadata-reader.js').NormalizedTags} tagModel
 * @param {{ writeId3Chunk?: boolean, cover?: { mime: string, data: Uint8Array }|null,
 *   infoEncoding?: 'utf-8'|'windows-1251' }} [opts]
 * @returns {{ bytes: Uint8Array, written: string[], skipped: string[] }}
 *   written: fields stored; skipped: non-empty fields that could not be stored
 */
export function writeWavTags(u8, tagModel, opts = {}) {
  const info = modelToInfo(tagModel);
  const written = [];
  const skipped = [];
  for (const [field, def] of Object.entries(WAV_FIELD_SUPPORT)) {
    const has = !!(tagModel[field] && String(tagModel[field]).trim());
    if (!has) continue;
    if (def.info) written.push(field);
    else if (opts.writeId3Chunk) written.push(field);
    else skipped.push(field);
  }
  let id3Bytes = null;
  if (opts.writeId3Chunk) {
    const picture = opts.cover ? { mime: opts.cover.mime, data: opts.cover.data } : null;
    id3Bytes = buildId3v23Tag(modelToId3Frames(tagModel), picture);
  } else if (opts.cover) {
    skipped.push('cover');
  }
  const bytes = writeWavMetadata(u8, Object.keys(info).length ? info : null, id3Bytes, {
    infoEncoding: opts.infoEncoding,
  });
  // RIFF INFO has no standard text encoding. The default is UTF-8; conversion
  // can target a Windows ANSI code page while an ID3 chunk preserves Unicode.
  const nonAscii = Object.values(info).some((v) => /[^\x20-\x7e]/.test(v));
  return { bytes, written, skipped, nonAsciiInfo: nonAscii };
}

/** Re-read INFO from produced bytes (verification helper). @param {Uint8Array} u8 */
export function readBackInfo(u8) { return readInfo(u8); }
