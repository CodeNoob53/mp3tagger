import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRiff, readInfo, readBext, readId3Chunk, writeWavMetadata } from '../src/modules/riff.js';
import { writeWavTags, readBackInfo } from '../src/modules/wav-tag-service.js';

const gen = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'generated');
const load = (n) => new Uint8Array(readFileSync(join(gen, n)));

describe('parseRiff', () => {
  it('parses a plain WAV', () => {
    const { chunks } = parseRiff(load('wav-plain.wav'));
    expect(chunks.map((c) => c.id)).toEqual(['fmt ', 'data']);
  });
  it('finds LIST INFO', () => {
    const { chunks } = parseRiff(load('wav-info.wav'));
    const list = chunks.find((c) => c.id === 'LIST');
    expect(list?.listType).toBe('INFO');
  });
  it('rejects non-WAV data', () => {
    expect(() => parseRiff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]))).toThrow(/RIFF/);
  });
  it('rejects a chunk that overflows the file', () => {
    const u8 = load('wav-plain.wav');
    const dv = new DataView(u8.buffer, u8.byteOffset);
    dv.setUint32(16, 0x7fffffff, true); // corrupt fmt size
    expect(() => parseRiff(u8)).toThrow(/exceeds file size/);
  });
});

describe('readInfo / readBext / readId3Chunk', () => {
  it('reads INFO values', () => {
    const info = readInfo(load('wav-info.wav'));
    expect(info.INAM).toBe('Wav Title');
    expect(info.IART).toBe('Wav Artist');
    expect(info.ICRD).toBe('2019');
  });
  it('reads bext description', () => {
    const bext = readBext(load('wav-bext.wav'));
    expect(bext.description).toBe('Fixture broadcast description');
    expect(bext.originationDate).toBe('2026-07-13');
  });
  it('finds the id3 chunk', () => {
    const id3 = readId3Chunk(load('wav-id3.wav'));
    expect(id3).not.toBeNull();
    expect(String.fromCharCode(id3[0], id3[1], id3[2])).toBe('ID3');
  });
});

describe('writeWavMetadata', () => {
  it('preserves fmt/data byte-for-byte and appends INFO', () => {
    const src = load('wav-plain.wav');
    const out = writeWavMetadata(src, { INAM: 'New Title' });
    const a = parseRiff(src);
    const b = parseRiff(out);
    const fmtA = a.chunks.find((c) => c.id === 'fmt ');
    const fmtB = b.chunks.find((c) => c.id === 'fmt ');
    expect(out.slice(fmtB.dataOffset, fmtB.dataOffset + fmtB.size))
      .toEqual(src.slice(fmtA.dataOffset, fmtA.dataOffset + fmtA.size));
    const dataA = a.chunks.find((c) => c.id === 'data');
    const dataB = b.chunks.find((c) => c.id === 'data');
    expect(out.slice(dataB.dataOffset, dataB.dataOffset + dataB.size))
      .toEqual(src.slice(dataA.dataOffset, dataA.dataOffset + dataA.size));
    expect(readInfo(out).INAM).toBe('New Title');
  });

  it('preserves unknown chunks verbatim', () => {
    const src = load('wav-unknown-chunk.wav');
    const out = writeWavMetadata(src, { IART: 'Somebody' });
    const junk = parseRiff(out).chunks.find((c) => c.id === 'JUNK');
    expect(junk).toBeTruthy();
    const payload = new TextDecoder().decode(out.slice(junk.dataOffset, junk.dataOffset + junk.size));
    expect(payload).toBe('do-not-touch-this-payload');
  });

  it('preserves bext when rewriting INFO', () => {
    const src = load('wav-bext.wav');
    const out = writeWavMetadata(src, { INAM: 'X' });
    expect(readBext(out)?.description).toBe('Fixture broadcast description');
  });

  it('replaces an existing INFO instead of duplicating', () => {
    const src = load('wav-info.wav');
    const out = writeWavMetadata(src, { INAM: 'Replaced' });
    const lists = parseRiff(out).chunks.filter((c) => c.id === 'LIST' && c.listType === 'INFO');
    expect(lists.length).toBe(1);
    expect(readInfo(out).INAM).toBe('Replaced');
    expect(readInfo(out).IART).toBeUndefined(); // full replace semantics
  });

  it('can remove INFO and id3 chunks', () => {
    const out = writeWavMetadata(load('wav-id3.wav'), null, null);
    const { chunks } = parseRiff(out);
    expect(chunks.some((c) => c.id === 'id3 ')).toBe(false);
  });

  it('unicode survives the INFO round-trip', () => {
    const out = writeWavMetadata(load('wav-plain.wav'), { INAM: 'Назва 標題' });
    expect(readInfo(out).INAM).toBe('Назва 標題');
  });
});

describe('wav-tag-service', () => {
  it('maps the model to INFO ids and reports skipped fields', () => {
    const src = load('wav-plain.wav');
    const model = { title: 'T', artist: 'A', lyrics: 'la-la', mood: 'calm' };
    const { bytes, written, skipped } = writeWavTags(src, model, {});
    expect(readBackInfo(bytes)).toMatchObject({ INAM: 'T', IART: 'A' });
    expect(written).toContain('title');
    expect(skipped).toContain('lyrics');
    expect(skipped).toContain('mood');
  });

  it('stores extra fields via the experimental id3 chunk', () => {
    const src = load('wav-plain.wav');
    const model = { title: 'T', lyrics: 'text', albumArtist: 'AA' };
    const { bytes, skipped } = writeWavTags(src, model, { writeId3Chunk: true });
    expect(skipped).toEqual([]);
    expect(readId3Chunk(bytes)).not.toBeNull();
  });
});
