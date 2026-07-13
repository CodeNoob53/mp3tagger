/**
 * Conversion queue on top of ffmpeg.wasm.
 * - one job at a time (WASM heap is shared);
 * - progress + cancellation;
 * - MEMFS cleanup after every job;
 * - tags are re-applied to the output by the caller (main.js) so that
 *   metadata survives the container switch.
 */
import { getFFmpeg, releaseFFmpeg } from './ffmpeg-loader.js';

/** @typedef {{ id: string, label: string, status: string, progress: number, cancel: () => void }} Job */

const queue = [];
let running = false;
const listeners = new Set();

/** Subscribe to queue changes. @param {(jobs: Job[]) => void} fn */
export function onQueueChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notifyQueue() { for (const fn of listeners) fn([...queue]); }

/**
 * @typedef {Object} ConvertOptions
 * @property {'mp3->wav'|'wav->mp3'} direction
 * @property {string|number} [sampleRate] 'source' or Hz
 * @property {16|24} [bitDepth]
 * @property {string|number} [channels] 'source' | 1 | 2
 * @property {'cbr'|'vbr'} [mode]
 * @property {number} [bitrate] kbps for CBR
 * @property {number} [vbrQuality] LAME -V value
 */

/** Build the ffmpeg argument list. Exported for unit tests. @param {ConvertOptions} opts */
export function buildArgs(opts, inName, outName) {
  const args = ['-i', inName];
  if (opts.direction === 'mp3->wav') {
    args.push('-map_metadata', '-1'); // we re-write metadata ourselves
    if (opts.sampleRate && opts.sampleRate !== 'source') args.push('-ar', String(opts.sampleRate));
    if (opts.channels && opts.channels !== 'source') args.push('-ac', String(opts.channels));
    args.push('-c:a', opts.bitDepth === 24 ? 'pcm_s24le' : 'pcm_s16le');
  } else {
    args.push('-map_metadata', '-1');
    if (opts.channels && opts.channels !== 'source') args.push('-ac', String(opts.channels));
    args.push('-c:a', 'libmp3lame');
    if (opts.mode === 'vbr') {
      args.push('-q:a', String(opts.vbrQuality ?? 0));
    } else {
      args.push('-b:a', `${opts.bitrate ?? 320}k`);
    }
    args.push('-id3v2_version', '3');
  }
  args.push(outName);
  return args;
}

/**
 * Enqueue a conversion.
 * @param {{ id: string, name: string, data: Uint8Array }} input
 * @param {ConvertOptions} opts
 * @param {{ onProgress?: (p: number, msg: string) => void }} [cb]
 * @returns {Promise<Uint8Array>} converted bytes
 */
export function convert(input, opts, cb = {}) {
  return new Promise((resolve, reject) => {
    const job = {
      id: input.id,
      label: `${input.name} → ${opts.direction === 'mp3->wav' ? 'WAV' : 'MP3'}`,
      status: 'queued',
      progress: 0,
      cancelled: false,
      cancel() {
        this.cancelled = true;
        if (this.status === 'running') {
          releaseFFmpeg(); // terminates the worker mid-run
        }
        this.status = 'cancelled';
        notifyQueue();
        reject(new DOMException('Conversion cancelled', 'AbortError'));
      },
      run: async () => {
        const inName = `in_${input.id}.${opts.direction === 'mp3->wav' ? 'mp3' : 'wav'}`;
        const outName = `out_${input.id}.${opts.direction === 'mp3->wav' ? 'wav' : 'mp3'}`;
        let ffmpeg;
        try {
          job.status = 'loading engine';
          notifyQueue();
          ffmpeg = await getFFmpeg(({ received, total }) => {
            job.progress = Math.min(0.99, received / total) * 0.2;
            job.status = `downloading engine ${(received / 1048576).toFixed(1)} MB`;
            cb.onProgress?.(job.progress, job.status);
            notifyQueue();
          });
          if (job.cancelled) return;
          job.status = 'running';
          notifyQueue();
          const onProg = ({ progress }) => {
            job.progress = 0.2 + Math.max(0, Math.min(1, progress)) * 0.8;
            cb.onProgress?.(job.progress, 'converting');
            notifyQueue();
          };
          ffmpeg.on('progress', onProg);
          try {
            await ffmpeg.writeFile(inName, input.data);
            const code = await ffmpeg.exec(buildArgs(opts, inName, outName));
            if (code !== 0) throw new Error(`FFmpeg exited with code ${code}. The file may be corrupted or unsupported.`);
            const out = await ffmpeg.readFile(outName);
            resolve(out instanceof Uint8Array ? out : new TextEncoder().encode(out));
          } finally {
            ffmpeg.off('progress', onProg);
            // MEMFS cleanup — ignore errors if files never got written
            for (const n of [inName, outName]) {
              try { await ffmpeg.deleteFile(n); } catch { /* not present */ }
            }
          }
          job.status = 'done';
          job.progress = 1;
        } catch (err) {
          if (job.cancelled) return; // already rejected
          if (String(err?.message ?? err).match(/out of memory|allocation failed|Cannot enlarge memory/i)) {
            releaseFFmpeg();
            reject(new Error('Not enough memory for this conversion. Close other tabs or try a smaller file.'));
          } else {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        } finally {
          notifyQueue();
        }
      },
    };
    queue.push(job);
    notifyQueue();
    pump();
  });
}

async function pump() {
  if (running) return;
  const job = queue.find((j) => j.status === 'queued');
  if (!job) {
    // queue drained: release the WASM heap after a grace period
    setTimeout(() => {
      if (!queue.some((j) => ['queued', 'running', 'loading engine'].includes(j.status))) {
        releaseFFmpeg();
      }
    }, 60_000);
    return;
  }
  running = true;
  try {
    await job.run();
  } finally {
    running = false;
    // drop finished jobs from the visible queue after a moment
    setTimeout(() => {
      const i = queue.indexOf(job);
      if (i !== -1 && ['done', 'cancelled'].includes(job.status)) { queue.splice(i, 1); notifyQueue(); }
    }, 4000);
    pump();
  }
}
