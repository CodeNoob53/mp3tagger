import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeMp3Tags, readBackV2, starsToPopm, popmToStars } from '../src/modules/mp3-tag-service.js';
import { detectFormat } from '../src/modules/audio-metadata-reader.js';
import { parseBuffer } from 'music-metadata';

const gen = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'generated');
const load = (n) => readFileSync(join(gen, n));
const toAB = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

/** Extract the raw MPEG audio stream (bytes after the ID3v2 tag). */
function audioStream(u8) {
  if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) {
    const size = (u8[6] << 21) | (u8[7] << 14) | (u8[8] << 7) | u8[9];
    return u8.slice(10 + size);
  }
  return u8.slice();
}

describe('detectFormat', () => {
  it('detects mp3 with and without tags', () => {
    expect(detectFormat(new Uint8Array(load('mp3-no-tags.mp3')))).toBe('mp3');
    expect(detectFormat(new Uint8Array(load('mp3-id3v23.mp3')))).toBe('mp3');
  });
  it('detects wav regardless of extension', () => {
    expect(detectFormat(new Uint8Array(load('wrong-ext.mp3')))).toBe('wav');
  });
  it('returns null for garbage', () => {
    expect(detectFormat(new Uint8Array(64).fill(0x20))).toBeNull();
  });
});

describe('writeMp3Tags', () => {
  const model = {
    title: 'New Title', artist: 'New Artist', album: 'Album', albumArtist: 'AA',
    track: '5', totalTracks: '12', disc: '1', totalDiscs: '2', year: '2024',
    genre: 'Jazz', composer: 'C', comment: 'hello', copyright: '© me', publisher: 'Pub',
    encodedBy: 'Aurela', bpm: '120', isrc: 'USRC17607839', language: 'eng',
    lyrics: 'line1\nline2', url: 'https://example.com', grouping: 'G', subtitle: 'S',
    conductor: 'Cond', remixer: 'R', originalArtist: 'OA', originalAlbum: 'OAl',
    mood: 'calm', rating: '4',
  };

  it('writes and reads back every supported field (v2.3)', async () => {
    const out = await writeMp3Tags(toAB(load('mp3-no-tags.mp3')), model, { version: 3 });
    const tags = await readBackV2(out);
    expect(tags.v2.TIT2).toBe('New Title');
    expect(tags.v2.TPE1).toBe('New Artist');
    expect(tags.v2.TRCK).toBe('5/12');
    expect(tags.v2.TPOS).toBe('1/2');
    expect(tags.v2.TYER).toBe('2024');
    expect(tags.v2.TSRC).toBe('USRC17607839');
    expect(tags.v2.COMM[0].text).toBe('hello');
    expect(tags.v2.USLT[0].text).toContain('line2');
    expect(tags.v2.WXXX[0].url).toBe('https://example.com');
    expect(tags.v2.POPM[0].rating).toBe(starsToPopm(4));
    // mood in v2.3 goes to TXXX
    expect(tags.v2.TXXX.find((x) => x.description === 'MOOD')?.text).toBe('calm');
    expect(tags.v2Details.version[0]).toBe(3);
  });

  it('writes v2.4 with TDRC', async () => {
    const out = await writeMp3Tags(toAB(load('mp3-no-tags.mp3')), model, { version: 4 });
    const tags = await readBackV2(out);
    expect(tags.v2Details.version[0]).toBe(4);
    expect(tags.v2.TDRC).toBe('2024');
    expect(tags.v2.TYER).toBeUndefined();
    expect(tags.v2.TMOO).toBe('calm');
  });

  it('does not touch the audio stream (no re-encode)', async () => {
    const src = new Uint8Array(load('mp3-id3v23.mp3'));
    const out = await writeMp3Tags(toAB(load('mp3-id3v23.mp3')), { ...model }, { version: 3 });
    expect(audioStream(out)).toEqual(audioStream(src));
  });

  it('preserves unknown frames (TXXX) from the existing tag', async () => {
    const out = await writeMp3Tags(toAB(load('mp3-id3v23.mp3')), { title: 'Changed' }, { version: 3 });
    const tags = await readBackV2(out);
    expect(tags.v2.TXXX.find((x) => x.description === 'CUSTOMFRAME')?.text).toBe('preserve-me');
    expect(tags.v2.TIT2).toBe('Changed');
  });

  it('preserves BMP unicode (Cyrillic, CJK, Greek)', async () => {
    // Known library limitation: mp3tag.js drops astral-plane chars (emoji).
    // Documented in docs/research.md; the UI warns before saving such values.
    const out = await writeMp3Tags(toAB(load('mp3-unicode.mp3')), { title: 'Пісня 歌曲 Ω', artist: 'Виконавець Æ' }, { version: 3 });
    const tags = await readBackV2(out);
    expect(tags.v2.TIT2).toBe('Пісня 歌曲 Ω');
    expect(tags.v2.TPE1).toBe('Виконавець Æ');
  });

  it('keeps the cover when cover is undefined, removes when null', async () => {
    const src = toAB(load('mp3-big-cover.mp3'));
    const kept = await writeMp3Tags(src, { title: 'K' }, { version: 3 });
    expect((await readBackV2(kept)).v2.APIC?.length).toBe(1);
    const removed = await writeMp3Tags(src, { title: 'R' }, { version: 3, cover: null });
    expect((await readBackV2(removed)).v2.APIC).toBeUndefined();
  });

  it('duration is unchanged after tagging (music-metadata check)', async () => {
    const before = await parseBuffer(new Uint8Array(load('mp3-id3v23.mp3')), 'audio/mpeg', { duration: true });
    const out = await writeMp3Tags(toAB(load('mp3-id3v23.mp3')), model, { version: 3 });
    const after = await parseBuffer(out, 'audio/mpeg', { duration: true });
    expect(after.format.duration).toBeCloseTo(before.format.duration, 3);
  });

  it('throws a friendly error on corrupted input', async () => {
    await expect(writeMp3Tags(toAB(load('corrupted.mp3')), { title: 'x' }, { version: 3 }))
      .rejects.toThrow();
  });
});

describe('POPM mapping', () => {
  it('round-trips stars', () => {
    for (const s of [0, 1, 2, 3, 4, 5]) expect(popmToStars(starsToPopm(s))).toBe(s);
  });
});
