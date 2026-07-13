/**
 * Reads technical info + tags from MP3/WAV files using music-metadata (lazy-loaded),
 * plus our own RIFF chunk table for WAV files.
 */
import { parseRiff, readInfo, readBext, INFO_IDS } from './riff.js';

let mmPromise = null;
function loadMusicMetadata() {
  mmPromise ??= import('music-metadata');
  return mmPromise;
}

/**
 * Detect real format from magic bytes (extension is not trusted).
 * @param {Uint8Array} u8
 * @returns {'mp3'|'wav'|null}
 */
export function detectFormat(u8) {
  if (u8.byteLength < 12) return null;
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
      u8[8] === 0x57 && u8[9] === 0x41 && u8[10] === 0x56 && u8[11] === 0x45) return 'wav';
  // ID3v2 header
  if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) return 'mp3';
  // scan first 4 KB for an MPEG audio frame sync
  const limit = Math.min(u8.byteLength - 1, 4096);
  for (let i = 0; i < limit; i++) {
    if (u8[i] === 0xff && (u8[i + 1] & 0xe0) === 0xe0) {
      const layer = (u8[i + 1] >> 1) & 0x03;
      if (layer !== 0) return 'mp3';
    }
  }
  return null;
}

/**
 * @typedef {Object} NormalizedTags
 * @property {string} [title] @property {string} [artist] @property {string} [album]
 * @property {string} [albumArtist] @property {string} [track] @property {string} [totalTracks]
 * @property {string} [disc] @property {string} [totalDiscs] @property {string} [year]
 * @property {string} [genre] @property {string} [composer] @property {string} [comment]
 * @property {string} [copyright] @property {string} [publisher] @property {string} [encodedBy]
 * @property {string} [bpm] @property {string} [isrc] @property {string} [language]
 * @property {string} [lyrics] @property {string} [url] @property {string} [grouping]
 * @property {string} [subtitle] @property {string} [conductor] @property {string} [remixer]
 * @property {string} [originalArtist] @property {string} [originalAlbum] @property {string} [mood]
 * @property {string} [rating]
 */

/** Convert music-metadata 0–1 rating to 0–5 stars. @param {number|undefined} r */
function ratingToStars(r) {
  if (typeof r !== 'number') return '';
  return String(Math.round(r * 5));
}

/**
 * Parse a file and produce the app's normalized model.
 * @param {File|Blob} blob
 * @param {Uint8Array} head first bytes (for format detection, ≥ 12 bytes)
 * @returns {Promise<{format:'mp3'|'wav', meta: object, tags: NormalizedTags, cover: {data:Uint8Array, format:string}|null, wav: object|null, warnings: string[]}>}
 */
export async function readFileMetadata(blob, head) {
  const warnings = [];
  const format = detectFormat(head);
  if (!format) throw new Error('Unsupported or unrecognized format (expected MP3 or WAV).');

  const mm = await loadMusicMetadata();
  let mmResult;
  try {
    mmResult = await mm.parseBlob(blob, { duration: true });
  } catch (err) {
    throw new Error(`Could not read metadata: ${err.message}`);
  }
  const { format: f, common } = mmResult;

  const meta = {
    duration: f.duration,
    bitrate: f.bitrate ? Math.round(f.bitrate / 1000) : undefined,
    sampleRate: f.sampleRate,
    channels: f.numberOfChannels,
    bitsPerSample: f.bitsPerSample,
    codec: f.codec ?? (format === 'mp3' ? 'MPEG' : 'PCM'),
    codecProfile: f.codecProfile,
    container: f.container,
    lossless: !!f.lossless,
    tagTypes: f.tagTypes ?? [],
  };

  /** @type {NormalizedTags} */
  const tags = {
    title: common.title ?? '',
    artist: common.artist ?? '',
    album: common.album ?? '',
    albumArtist: common.albumartist ?? '',
    track: common.track?.no ? String(common.track.no) : '',
    totalTracks: common.track?.of ? String(common.track.of) : '',
    disc: common.disk?.no ? String(common.disk.no) : '',
    totalDiscs: common.disk?.of ? String(common.disk.of) : '',
    year: common.year ? String(common.year) : '',
    genre: common.genre?.[0] ?? '',
    composer: common.composer?.[0] ?? '',
    comment: common.comment?.[0]?.text ?? (typeof common.comment?.[0] === 'string' ? common.comment[0] : '') ?? '',
    copyright: common.copyright ?? '',
    publisher: common.label?.[0] ?? '',
    encodedBy: common.encodedby ?? '',
    bpm: common.bpm ? String(Math.round(Number(common.bpm))) : '',
    isrc: common.isrc?.[0] ?? '',
    language: common.language ?? '',
    lyrics: common.lyrics?.[0]?.text ?? (typeof common.lyrics?.[0] === 'string' ? common.lyrics[0] : '') ?? '',
    url: common.website ?? '',
    grouping: common.grouping ?? '',
    subtitle: common.subtitle?.[0] ?? '',
    conductor: common.conductor?.[0] ?? '',
    remixer: common.remixer?.[0] ?? '',
    originalArtist: common.originalartist ?? '',
    originalAlbum: common.originalalbum ?? '',
    mood: common.mood ?? '',
    rating: ratingToStars(common.rating?.[0]?.rating),
  };

  let cover = null;
  const pic = mm.selectCover ? mm.selectCover(common.picture) : common.picture?.[0];
  if (pic) {
    cover = { data: pic.data instanceof Uint8Array ? pic.data : new Uint8Array(pic.data), format: pic.format || 'image/jpeg' };
  }

  let wav = null;
  if (format === 'wav') {
    const u8 = new Uint8Array(await blob.arrayBuffer());
    try {
      const { chunks } = parseRiff(u8);
      const info = readInfo(u8);
      const bext = readBext(u8);
      const hasId3 = chunks.some((c) => c.id === 'id3 ' || c.id === 'ID3 ');
      wav = {
        chunks: chunks.map((c) => ({ id: c.id, listType: c.listType, size: c.size })),
        info,
        bext,
        hasId3Chunk: hasId3,
        unknownInfoIds: Object.keys(info).filter((k) => !INFO_IDS.includes(k)),
      };
      if (bext) warnings.push('This WAV contains a BEXT (Broadcast Wave) chunk. It is preserved as-is; editing BEXT is not supported.');
      if (hasId3) warnings.push('This WAV contains a non-standard id3 chunk. Its values are shown where readable and it will be rewritten if you save tags with the id3 option enabled.');
    } catch (err) {
      warnings.push(`RIFF structure warning: ${err.message}`);
    }
  }

  return { format, meta, tags, cover, wav, warnings };
}
