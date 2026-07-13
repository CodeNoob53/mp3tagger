/**
 * Lazy FFmpeg loader. Uses the single-thread core (no SharedArrayBuffer),
 * which works on GitHub Pages without COOP/COEP headers. The 0.12 API runs
 * FFmpeg inside its own Web Worker, so the UI thread stays responsive.
 *
 * The ~31 MB core is fetched from jsDelivr on first use and cached by the
 * browser (and converted to Blob URLs to avoid cross-origin worker limits).
 * No user data is ever sent anywhere — only the engine binary is downloaded.
 */

const CORE_VERSION = '0.12.10';
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpegInstance = null;
let loadingPromise = null;
let engineObjectUrls = [];

function assertResponse(response, url) {
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
}

/**
 * Fetch an engine asset and expose it as a same-origin Blob URL.
 *
 * @ffmpeg/util's progress helper falls back to response.arrayBuffer() after
 * consuming response.body. Browsers correctly reject that second read with
 * "body stream already read". If streaming fails here, we retry with a fresh
 * Response instead.
 *
 * Exported for regression tests.
 * @param {string} url
 * @param {string} mimeType
 * @param {(progress: { received: number, total: number }) => void} [onDownload]
 */
export async function downloadToBlobURL(url, mimeType, onDownload) {
  const response = await fetch(url);
  assertResponse(response, url);
  const headerTotal = Number(response.headers.get('content-length')) || 0;

  let bytes;
  if (!response.body) {
    bytes = new Uint8Array(await response.arrayBuffer());
    onDownload?.({ received: bytes.byteLength, total: headerTotal || bytes.byteLength });
  } else {
    try {
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          chunks.push(value);
          received += value.byteLength;
          onDownload?.({ received, total: headerTotal || received });
        }
      }
      bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      onDownload?.({ received, total: headerTotal || received });
    } catch {
      // The first Response may now be disturbed/locked. Never read it again.
      const retry = await fetch(url);
      assertResponse(retry, url);
      bytes = new Uint8Array(await retry.arrayBuffer());
      const retryTotal = Number(retry.headers.get('content-length')) || bytes.byteLength;
      onDownload?.({ received: bytes.byteLength, total: retryTotal });
    }
  }

  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

/**
 * Get a ready FFmpeg instance.
 * @param {(progress: { received: number, total: number }) => void} [onDownload]
 * @returns {Promise<import('@ffmpeg/ffmpeg').FFmpeg>}
 */
export async function getFFmpeg(onDownload) {
  if (ffmpegInstance) return ffmpegInstance;
  loadingPromise ??= (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ffmpeg = new FFmpeg();
    let received = 0;
    const track = (p) => {
      received = p.received ?? received;
      onDownload?.({ received, total: p.total ?? 32_000_000 });
    };
    const urls = [];
    try {
      const coreURL = await downloadToBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript', track);
      urls.push(coreURL);
      const wasmURL = await downloadToBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm', track);
      urls.push(wasmURL);
      await ffmpeg.load({ coreURL, wasmURL });
    } catch (err) {
      for (const url of urls) URL.revokeObjectURL(url);
      throw err;
    }
    engineObjectUrls = urls;
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();
  try {
    return await loadingPromise;
  } catch (err) {
    loadingPromise = null; // allow retry
    throw new Error(`Could not load the FFmpeg engine: ${err.message}. Check your network connection and retry.`);
  }
}

/** Terminate the worker and free the WASM heap. */
export function releaseFFmpeg() {
  if (ffmpegInstance) {
    try { ffmpegInstance.terminate(); } catch { /* already dead */ }
    ffmpegInstance = null;
    loadingPromise = null;
  }
  for (const url of engineObjectUrls) URL.revokeObjectURL(url);
  engineObjectUrls = [];
}

/** True if the engine is already in memory. */
export function isLoaded() { return !!ffmpegInstance; }
