import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildArgs } from '../src/modules/conversion-service.js';
import { buildId3v23Tag } from '../src/modules/id3-encoder.js';
import { parseBuffer } from 'music-metadata';

describe('conversion buildArgs', () => {
  it('mp3->wav default: 16-bit, no resample', () => {
    const args = buildArgs({ direction: 'mp3->wav', sampleRate: 'source', channels: 'source', bitDepth: 16 }, 'in.mp3', 'out.wav');
    expect(args).toContain('pcm_s16le');
    expect(args).not.toContain('-ar');
    expect(args).not.toContain('-ac');
  });
  it('mp3->wav with resample and mono', () => {
    const args = buildArgs({ direction: 'mp3->wav', sampleRate: 48000, channels: 1, bitDepth: 24 }, 'i', 'o');
    expect(args.join(' ')).toContain('-ar 48000');
    expect(args.join(' ')).toContain('-ac 1');
    expect(args).toContain('pcm_s24le');
  });
  it('wav->mp3 CBR 320 default', () => {
    const args = buildArgs({ direction: 'wav->mp3', mode: 'cbr', bitrate: 320 }, 'i', 'o');
    expect(args.join(' ')).toContain('-b:a 320k');
    expect(args).toContain('libmp3lame');
  });
  it('wav->mp3 VBR', () => {
    const args = buildArgs({ direction: 'wav->mp3', mode: 'vbr', vbrQuality: 2 }, 'i', 'o');
    expect(args.join(' ')).toContain('-q:a 2');
  });
});

describe('id3-encoder', () => {
  it('produces a tag music-metadata can parse', async () => {
    const tag = buildId3v23Tag({ TIT2: 'Заголовок', TPE1: 'Артист' });
    // wrap in minimal mp3 so the parser accepts it
    const frame = new Uint8Array(417); frame.set([0xff, 0xfb, 0x90, 0x00]);
    const mp3 = new Uint8Array(tag.length + frame.length);
    mp3.set(tag, 0); mp3.set(frame, tag.length);
    const meta = await parseBuffer(mp3, 'audio/mpeg');
    expect(meta.common.title).toBe('Заголовок');
    expect(meta.common.artist).toBe('Артист');
  });
});

describe('object-url-manager', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => `blob:${Math.random()}`),
      revokeObjectURL: vi.fn(),
    });
    vi.resetModules();
  });
  it('tracks and revokes URLs without leaks', async () => {
    const { createUrl, revokeUrl, revokeAll, liveCount } = await import('../src/modules/object-url-manager.js');
    const a = createUrl(new Blob(['x']));
    const b = createUrl(new Blob(['y']));
    expect(liveCount()).toBe(2);
    revokeUrl(a);
    expect(liveCount()).toBe(1);
    revokeAll();
    expect(liveCount()).toBe(0);
    revokeUrl(b); // double revoke is a no-op
    expect(liveCount()).toBe(0);
  });
});
