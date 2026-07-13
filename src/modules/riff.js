/**
 * Minimal RIFF/WAVE container parser and INFO/id3 chunk writer.
 * Guarantees: all chunks other than `LIST INFO` and `id3 ` are copied
 * byte-for-byte; chunk order is preserved; word alignment maintained.
 */

const td = new TextDecoder('latin1');
const te = new TextEncoder();

/**
 * @typedef {Object} RiffChunk
 * @property {string} id fourcc
 * @property {number} offset absolute offset of the fourcc
 * @property {number} dataOffset absolute offset of chunk payload
 * @property {number} size payload size (without pad byte)
 * @property {string} [listType] for LIST chunks, the list fourcc (e.g. 'INFO')
 */

/** Read fourcc at offset. @param {DataView} dv @param {number} off */
function fourcc(dv, off) {
  return td.decode(new Uint8Array(dv.buffer, dv.byteOffset + off, 4));
}

/**
 * Parse the top-level chunk table of a WAVE file.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ chunks: RiffChunk[], riffSize: number }}
 * @throws {Error} if not a RIFF/WAVE file or structurally broken
 */
export function parseRiff(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < 12 || fourcc(dv, 0) !== 'RIFF' || fourcc(dv, 8) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file.');
  }
  const riffSize = dv.getUint32(4, true);
  const chunks = [];
  let off = 12;
  const end = Math.min(u8.byteLength, 8 + riffSize);
  while (off + 8 <= end) {
    const id = fourcc(dv, off);
    const size = dv.getUint32(off + 4, true);
    if (off + 8 + size > u8.byteLength) {
      throw new Error(`Corrupted WAV: chunk "${id}" exceeds file size.`);
    }
    /** @type {RiffChunk} */
    const chunk = { id, offset: off, dataOffset: off + 8, size };
    if (id === 'LIST' && size >= 4) chunk.listType = fourcc(dv, off + 8);
    chunks.push(chunk);
    off += 8 + size + (size % 2); // pad to word boundary
  }
  if (!chunks.some((c) => c.id === 'fmt ')) throw new Error('Corrupted WAV: missing fmt chunk.');
  if (!chunks.some((c) => c.id === 'data')) throw new Error('Corrupted WAV: missing data chunk.');
  return { chunks, riffSize };
}

/** Standard + common RIFF INFO tag ids we can read. */
export const INFO_IDS = [
  'INAM', 'IART', 'IPRD', 'IGNR', 'ICRD', 'ICMT', 'ICOP', 'IENG', 'ISFT',
  'ITRK', 'IPRT', 'ISBJ', 'ISRC', 'ILNG', 'IKEY', 'IMED', 'ITCH', 'ICMS', 'IARL', 'IWRI',
];

/**
 * Read LIST-INFO key/value pairs.
 * @param {Uint8Array} u8 whole file
 * @returns {Record<string, string>}
 */
export function readInfo(u8) {
  const { chunks } = parseRiff(u8);
  const list = chunks.find((c) => c.id === 'LIST' && c.listType === 'INFO');
  if (!list) return {};
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const out = {};
  let off = list.dataOffset + 4;
  const end = list.dataOffset + list.size;
  const utf8 = new TextDecoder('utf-8', { fatal: false });
  while (off + 8 <= end) {
    const id = fourcc(dv, off);
    const size = dv.getUint32(off + 4, true);
    if (off + 8 + size > end + 1) break;
    const raw = u8.subarray(off + 8, off + 8 + size);
    let str = utf8.decode(raw);
    const nul = str.indexOf('\u0000');
    if (nul !== -1) str = str.slice(0, nul);
    out[id] = str;
    off += 8 + size + (size % 2);
  }
  return out;
}

/**
 * Read the bext (Broadcast Wave) description fields, if present. Read-only.
 * @param {Uint8Array} u8
 * @returns {{description:string, originator:string, originationDate:string}|null}
 */
export function readBext(u8) {
  const { chunks } = parseRiff(u8);
  const bext = chunks.find((c) => c.id === 'bext');
  if (!bext || bext.size < 348) return null;
  const dec = new TextDecoder('latin1');
  const cut = (start, len) => {
    const s = dec.decode(u8.subarray(bext.dataOffset + start, bext.dataOffset + start + len));
    const nul = s.indexOf('\u0000');
    return (nul === -1 ? s : s.slice(0, nul)).trim();
  };
  return {
    description: cut(0, 256),
    originator: cut(256, 32),
    originationDate: cut(320, 10),
  };
}

/** Extract raw payload of the embedded `id3 `/`ID3 ` chunk, if any. @param {Uint8Array} u8 */
export function readId3Chunk(u8) {
  const { chunks } = parseRiff(u8);
  const c = chunks.find((x) => x.id === 'id3 ' || x.id === 'ID3 ');
  return c ? u8.slice(c.dataOffset, c.dataOffset + c.size) : null;
}

/** Build a LIST-INFO chunk from a key/value map. @param {Record<string,string>} info */
function buildInfoChunk(info) {
  const parts = [];
  for (const [id, value] of Object.entries(info)) {
    if (!value) continue;
    const data = te.encode(`${value}\u0000`); // NUL-terminated
    const padded = data.byteLength + (data.byteLength % 2);
    const buf = new Uint8Array(8 + padded);
    buf.set(te.encode(id.padEnd(4).slice(0, 4)), 0);
    new DataView(buf.buffer).setUint32(4, data.byteLength, true);
    buf.set(data, 8);
    parts.push(buf);
  }
  if (parts.length === 0) return null;
  const payloadSize = 4 + parts.reduce((a, p) => a + p.byteLength, 0);
  const chunk = new Uint8Array(8 + payloadSize + (payloadSize % 2));
  chunk.set(te.encode('LIST'), 0);
  new DataView(chunk.buffer).setUint32(4, payloadSize, true);
  chunk.set(te.encode('INFO'), 8);
  let off = 12;
  for (const p of parts) { chunk.set(p, off); off += p.byteLength; }
  return chunk;
}

/** Wrap raw ID3v2 tag bytes in an `id3 ` chunk. @param {Uint8Array} id3Bytes */
function buildId3Chunk(id3Bytes) {
  const chunk = new Uint8Array(8 + id3Bytes.byteLength + (id3Bytes.byteLength % 2));
  chunk.set(te.encode('id3 '), 0);
  new DataView(chunk.buffer).setUint32(4, id3Bytes.byteLength, true);
  chunk.set(id3Bytes, 8);
  return chunk;
}

/**
 * Rewrite a WAV file replacing (or removing) its LIST-INFO and `id3 ` chunks.
 * Every other chunk is copied verbatim, preserving order. New INFO/id3 chunks
 * are appended at the end (safest position — after `data`).
 * @param {Uint8Array} u8 original file
 * @param {Record<string,string>|null} info INFO map (null = remove INFO chunk)
 * @param {Uint8Array|null} [id3Bytes] raw ID3v2 tag to embed (null = remove)
 * @returns {Uint8Array} new file
 */
export function writeWavMetadata(u8, info, id3Bytes = null) {
  const { chunks } = parseRiff(u8);
  const kept = [];
  for (const c of chunks) {
    const isInfo = c.id === 'LIST' && c.listType === 'INFO';
    const isId3 = c.id === 'id3 ' || c.id === 'ID3 ';
    if (isInfo || isId3) continue;
    const total = 8 + c.size + (c.size % 2);
    kept.push(u8.subarray(c.offset, Math.min(c.offset + total, u8.byteLength)));
  }
  const infoChunk = info ? buildInfoChunk(info) : null;
  const id3Chunk = id3Bytes ? buildId3Chunk(id3Bytes) : null;

  let size = 4; // 'WAVE'
  for (const k of kept) size += k.byteLength;
  if (infoChunk) size += infoChunk.byteLength;
  if (id3Chunk) size += id3Chunk.byteLength;

  const out = new Uint8Array(8 + size);
  const dv = new DataView(out.buffer);
  out.set(te.encode('RIFF'), 0);
  dv.setUint32(4, size, true);
  out.set(te.encode('WAVE'), 8);
  let off = 12;
  for (const k of kept) { out.set(k, off); off += k.byteLength; }
  if (infoChunk) { out.set(infoChunk, off); off += infoChunk.byteLength; }
  if (id3Chunk) { out.set(id3Chunk, off); off += id3Chunk.byteLength; }
  return out;
}
