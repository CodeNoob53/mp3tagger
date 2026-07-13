import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadToBlobURL } from '../src/modules/ffmpeg-loader.js';

const headers = (length) => ({
  get: (name) => name.toLowerCase() === 'content-length' ? String(length) : null,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('downloadToBlobURL', () => {
  it('streams an asset without re-reading the response body', async () => {
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2]) })
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([3]) })
        .mockResolvedValueOnce({ done: true }),
    };
    const response = {
      ok: true,
      status: 200,
      headers: headers(999), // decoded body sizes may differ from this header
      body: { getReader: () => reader },
      arrayBuffer: vi.fn(() => { throw new Error('must not re-read'); }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:engine');

    await expect(downloadToBlobURL('https://cdn.test/core.wasm', 'application/wasm'))
      .resolves.toBe('blob:engine');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(response.arrayBuffer).not.toHaveBeenCalled();
  });

  it('uses a fresh response when stream reading fails', async () => {
    const first = {
      ok: true,
      status: 200,
      headers: headers(10),
      body: { getReader: () => ({ read: vi.fn().mockRejectedValue(new Error('stream failed')) }) },
      arrayBuffer: vi.fn(() => { throw new Error('body stream already read'); }),
    };
    const retry = {
      ok: true,
      status: 200,
      headers: headers(3),
      body: null,
      arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
    };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(retry));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:retry');

    await expect(downloadToBlobURL('https://cdn.test/core.wasm', 'application/wasm'))
      .resolves.toBe('blob:retry');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(first.arrayBuffer).not.toHaveBeenCalled();
    expect(retry.arrayBuffer).toHaveBeenCalledOnce();
  });
});
