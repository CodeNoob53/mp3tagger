/**
 * Field validation and text/filename sanitization.
 * All functions are pure — unit-tested in tests/validation.test.js.
 */

/** Strip control characters and null bytes; trim. @param {string} s */
export function sanitizeText(s) {
  if (typeof s !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[\r\n\t]+/g, ' ').trim();
}

/** Like sanitizeText but preserves line breaks (for lyrics/comments). @param {string} s */
export function sanitizeMultiline(s) {
  if (typeof s !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim();
}

/**
 * Make a string safe for use as a filename on Windows/macOS/Linux.
 * @param {string} name @returns {string}
 */
export function sanitizeFilename(name) {
  const cleaned = sanitizeText(name)
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '');
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (!cleaned || reserved.test(cleaned)) return `untitled${cleaned ? `_${cleaned}` : ''}`;
  return cleaned.slice(0, 200);
}

/** @typedef {{ ok: boolean, message?: string }} ValidationResult */

/** @param {string} v @returns {ValidationResult} */
export function validateYear(v) {
  if (!v) return { ok: true };
  if (!/^\d{4}$/.test(v)) return { ok: false, message: 'Year must be a 4-digit number.' };
  const n = Number(v);
  if (n < 1000 || n > 2100) return { ok: false, message: 'Year must be between 1000 and 2100.' };
  return { ok: true };
}

/** @param {string} v @returns {ValidationResult} */
export function validateBpm(v) {
  if (!v) return { ok: true };
  if (!/^\d+$/.test(v)) return { ok: false, message: 'BPM must be a whole number.' };
  const n = Number(v);
  if (n < 20 || n > 1000) return { ok: false, message: 'BPM must be between 20 and 1000.' };
  return { ok: true };
}

/** Track / disc numbers. @param {string} v @param {string} label @returns {ValidationResult} */
export function validateTrackNumber(v, label = 'Track') {
  if (!v) return { ok: true };
  if (!/^\d{1,4}$/.test(v)) return { ok: false, message: `${label} must be a positive number.` };
  if (Number(v) === 0) return { ok: false, message: `${label} cannot be 0.` };
  return { ok: true };
}

/** @param {string} v @returns {ValidationResult} */
export function validateIsrc(v) {
  if (!v) return { ok: true };
  const s = v.replace(/-/g, '').toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/.test(s)) {
    return { ok: false, message: 'ISRC must look like CC-XXX-YY-NNNNN (e.g. USRC17607839).' };
  }
  return { ok: true };
}

/** Normalize ISRC to compact uppercase form. @param {string} v */
export function normalizeIsrc(v) { return v ? v.replace(/-/g, '').toUpperCase() : v; }

/** @param {string} v @returns {ValidationResult} */
export function validateUrl(v) {
  if (!v) return { ok: true };
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, message: 'URL must start with http:// or https://.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'URL is not valid.' };
  }
}

/** @param {string} v @returns {ValidationResult} */
export function validateLanguage(v) {
  if (!v) return { ok: true };
  if (!/^[a-zA-Z]{3}$/.test(v)) return { ok: false, message: 'Language must be a 3-letter ISO 639-2 code (e.g. eng, ukr).' };
  return { ok: true };
}

/** @param {string|number} v @returns {ValidationResult} */
export function validateRating(v) {
  if (v === '' || v === null || v === undefined) return { ok: true };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 5) return { ok: false, message: 'Rating must be an integer 0–5.' };
  return { ok: true };
}

/**
 * Validate the whole tag model.
 * @param {Record<string, string>} tags
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function validateTags(tags) {
  const errors = {};
  const put = (field, res) => { if (!res.ok) errors[field] = res.message; };
  put('year', validateYear(tags.year ?? ''));
  put('bpm', validateBpm(tags.bpm ?? ''));
  put('track', validateTrackNumber(tags.track ?? '', 'Track number'));
  put('totalTracks', validateTrackNumber(tags.totalTracks ?? '', 'Total tracks'));
  put('disc', validateTrackNumber(tags.disc ?? '', 'Disc number'));
  put('totalDiscs', validateTrackNumber(tags.totalDiscs ?? '', 'Total discs'));
  put('isrc', validateIsrc(tags.isrc ?? ''));
  put('url', validateUrl(tags.url ?? ''));
  put('language', validateLanguage(tags.language ?? ''));
  put('rating', validateRating(tags.rating ?? ''));
  if (tags.track && tags.totalTracks && Number(tags.track) > Number(tags.totalTracks)) {
    errors.track = 'Track number is greater than total tracks.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Cover size budget: min(1 MB, 5% of audio) by default, user-overridable,
 * never larger than the audio itself.
 * @param {number} audioBytes
 * @param {'auto'|number} limitMode 'auto' or explicit KB
 * @returns {{ hardLimit: number, recommended: number, aggressive: boolean }}
 */
export function coverBudget(audioBytes, limitMode = 'auto') {
  const RECOMMENDED = 500 * 1024;
  let hardLimit;
  if (limitMode === 'auto') {
    hardLimit = Math.min(1024 * 1024, Math.floor(audioBytes * 0.05));
    // tiny audio: don't drop below a usable floor, but never exceed the audio size
    hardLimit = Math.max(hardLimit, Math.min(64 * 1024, Math.floor(audioBytes * 0.5)));
  } else {
    hardLimit = limitMode * 1024;
  }
  hardLimit = Math.min(hardLimit, Math.max(0, audioBytes - 1)); // absolute rule: cover < audio
  return {
    hardLimit,
    recommended: Math.min(RECOMMENDED, hardLimit),
    aggressive: audioBytes < 2 * 1024 * 1024,
  };
}
