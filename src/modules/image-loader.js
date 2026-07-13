/**
 * Decodes cover-art images from files, drops, and clipboard.
 */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_DIM = 10_000;

/**
 * @param {Blob} blob
 * @returns {Promise<{ bitmap: ImageBitmap, blob: Blob, type: string }>}
 * @throws {Error} for unsupported type / decode failure / absurd size
 */
export async function loadImage(blob) {
  if (!ACCEPTED.includes(blob.type)) {
    throw new Error(`Unsupported image type "${blob.type || 'unknown'}". Use JPEG, PNG or WebP.`);
  }
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('Image is larger than 50 MB — please pick a smaller file.');
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error('Could not decode the image — the file may be corrupted.');
  }
  if (bitmap.width > MAX_IMAGE_DIM || bitmap.height > MAX_IMAGE_DIM) {
    bitmap.close();
    throw new Error(`Image is too large (${bitmap.width}×${bitmap.height}). Max ${MAX_IMAGE_DIM}px per side.`);
  }
  return { bitmap, blob, type: blob.type };
}

/** Extract the first image file from a paste/drop DataTransfer. @param {DataTransfer} dt */
export function imageFromDataTransfer(dt) {
  for (const item of dt.items ?? []) {
    if (item.kind === 'file' && ACCEPTED.includes(item.type)) return item.getAsFile();
  }
  return null;
}
