/**
 * Minimal standalone ID3v2.3 tag encoder.
 * Used only to build the experimental `id3 ` chunk for WAV files
 * (mp3tag.js requires an MPEG stream, so it cannot produce a bare tag).
 * Text frames are written as UTF-16 with BOM (encoding 0x01), which every
 * ID3v2.3 reader must support.
 */

/** @param {number} n 32-bit synchsafe */
function synchsafe(n) {
  return new Uint8Array([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

/** Encode string as UTF-16LE with BOM. @param {string} s */
function utf16(s) {
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xff; out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out[2 + i * 2] = code & 0xff;
    out[3 + i * 2] = code >> 8;
  }
  return out;
}

/** Build one frame. @param {string} id @param {Uint8Array} payload */
function frame(id, payload) {
  const buf = new Uint8Array(10 + payload.byteLength);
  for (let i = 0; i < 4; i++) buf[i] = id.charCodeAt(i);
  const dv = new DataView(buf.buffer);
  dv.setUint32(4, payload.byteLength, false); // v2.3 uses plain big-endian size
  buf.set(payload, 10);
  return buf;
}

/** Text frame (encoding byte + UTF-16 BOM text + terminator). */
function textFrame(id, text) {
  const t = utf16(text);
  const payload = new Uint8Array(1 + t.byteLength + 2);
  payload[0] = 0x01;
  payload.set(t, 1);
  return frame(id, payload);
}

/**
 * Build a complete ID3v2.3 tag.
 * @param {Record<string, string>} textFrames map of frame id -> text (e.g. TIT2)
 * @param {{ mime: string, data: Uint8Array }|null} [picture] APIC front cover
 * @returns {Uint8Array} raw tag bytes
 */
export function buildId3v23Tag(textFrames, picture = null) {
  const frames = [];
  for (const [id, text] of Object.entries(textFrames)) {
    if (text && /^[A-Z0-9]{4}$/.test(id)) frames.push(textFrame(id, String(text)));
  }
  if (picture) {
    const mime = new TextEncoder().encode(`${picture.mime}\u0000`);
    const payload = new Uint8Array(1 + mime.byteLength + 1 + 1 + picture.data.byteLength);
    let o = 0;
    payload[o++] = 0x00;            // encoding: latin1 for description
    payload.set(mime, o); o += mime.byteLength;
    payload[o++] = 0x03;            // picture type: front cover
    payload[o++] = 0x00;            // empty description terminator
    payload.set(picture.data, o);
    frames.push(frame('APIC', payload));
  }
  const framesSize = frames.reduce((a, f) => a + f.byteLength, 0);
  const tag = new Uint8Array(10 + framesSize);
  tag[0] = 0x49; tag[1] = 0x44; tag[2] = 0x33; // 'ID3'
  tag[3] = 0x03; tag[4] = 0x00;                // v2.3.0
  tag[5] = 0x00;                               // no flags
  tag.set(synchsafe(framesSize), 6);
  let off = 10;
  for (const f of frames) { tag.set(f, off); off += f.byteLength; }
  return tag;
}
