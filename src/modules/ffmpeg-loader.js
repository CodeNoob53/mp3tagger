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

/**
 * Get a ready FFmpeg instance.
 * @param {(progress: { received: number, total: number }) => void} [onDownload]
 * @returns {Promise<import('@ffmpeg/ffmpeg').FFmpeg>}
 */
export async function getFFmpeg(onDownload) {
  if (ffmpegInstance) return ffmpegInstance;
  loadingPromise ??= (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ]);
    const ffmpeg = new FFmpeg();
    let received = 0;
    const track = (p) => {
      received = p.received ?? received;
      onDownload?.({ received, total: p.total ?? 32_000_000 });
    };
    const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript', true, track);
    const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm', true, track);
    await ffmpeg.load({ coreURL, wasmURL });
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
}

/** True if the engine is already in memory. */
export function isLoaded() { return !!ffmpegInstance; }
