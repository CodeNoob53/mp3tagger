/**
 * Renders the cropped square cover and compresses it to fit a byte budget.
 * Canvas re-encoding strips EXIF/ICC/XMP automatically.
 */

export const MIN_QUALITY = 0.35; // below this we stop and ask the user instead

/**
 * Render the crop result to a square canvas.
 * @param {ImageBitmap} bitmap source image
 * @param {{ x: number, y: number, scale: number, rotation: number }} t
 *   transform in "stage" coordinates (stage = square of stageSize px)
 * @param {number} stageSize size of the on-screen stage square
 * @param {number} outSize output resolution (e.g. 500)
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
export function renderCrop(bitmap, t, stageSize, outSize) {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(outSize, outSize)
    : Object.assign(document.createElement('canvas'), { width: outSize, height: outSize });
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, outSize, outSize);
  const k = outSize / stageSize;
  ctx.save();
  ctx.translate(t.x * k, t.y * k);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale * k, t.scale * k);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  ctx.restore();
  return canvas;
}

/** toBlob that works for both canvas kinds. */
async function canvasToBlob(canvas, type, quality) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed.'))), type, quality);
  });
}

/**
 * Compress a rendered canvas to fit a byte budget.
 * Prefers JPEG; falls back through quality steps, then resolution steps.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {ImageBitmap} bitmap original (for re-render at smaller sizes)
 * @param {object} renderArgs { t, stageSize } to re-render at lower resolution
 * @param {number} budget max bytes
 * @param {{ aggressive?: boolean }} [opts]
 * @returns {Promise<{ blob: Blob, width: number, quality: number, tooLow: boolean }>}
 */
export async function compressToBudget(canvas, bitmap, renderArgs, budget, opts = {}) {
  const sizes = [canvas.width];
  for (let s = canvas.width; s > 200; s = Math.round(s * 0.75)) {
    if (s !== canvas.width) sizes.push(s);
  }
  const startQ = opts.aggressive ? 0.75 : 0.9;
  for (const size of sizes) {
    const c = size === canvas.width ? canvas : renderCrop(bitmap, renderArgs.t, renderArgs.stageSize, size);
    for (let q = startQ; q >= MIN_QUALITY - 1e-6; q -= 0.1) {
      const blob = await canvasToBlob(c, 'image/jpeg', q);
      if (blob.size <= budget) {
        return { blob, width: size, quality: q, tooLow: false };
      }
    }
  }
  // nothing fit the budget even at minimum quality/resolution
  const lastCanvas = renderCrop(bitmap, renderArgs.t, renderArgs.stageSize, sizes[sizes.length - 1]);
  const blob = await canvasToBlob(lastCanvas, 'image/jpeg', MIN_QUALITY);
  return { blob, width: lastCanvas.width, quality: MIN_QUALITY, tooLow: true };
}

/**
 * Encode without a budget (PNG stays PNG for transparency, else JPEG 0.92).
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {string} sourceType original mime
 */
export async function encodePlain(canvas, sourceType) {
  const type = sourceType === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, type, 0.92);
  return { blob, type };
}
