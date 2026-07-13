/**
 * Single-file downloads and ZIP export (fflate, lazy-loaded).
 */
import { createUrl, revokeUrl } from './object-url-manager.js';
import { uniquifyNames } from './filename-templates.js';

/**
 * Trigger a browser download for a blob.
 * @param {Blob} blob @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = createUrl(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // release shortly after the click handed the URL to the browser
  setTimeout(() => revokeUrl(url), 30_000);
}

/**
 * Zip files (stored, no re-compression) and download.
 * @param {{ name: string, blob: Blob }[]} entries
 * @param {string} zipName
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function downloadZip(entries, zipName, onProgress) {
  const { zip } = await import('fflate');
  const names = uniquifyNames(entries.map((e) => e.name));
  /** @type {Record<string, [Uint8Array, object]>} */
  const tree = {};
  let done = 0;
  for (let i = 0; i < entries.length; i++) {
    tree[names[i]] = [new Uint8Array(await entries[i].blob.arrayBuffer()), { level: 0 }];
    done += 1;
    onProgress?.(done, entries.length + 1);
  }
  const zipped = await new Promise((resolve, reject) => {
    zip(tree, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
  onProgress?.(entries.length + 1, entries.length + 1);
  downloadBlob(new Blob([zipped], { type: 'application/zip' }), zipName);
}
