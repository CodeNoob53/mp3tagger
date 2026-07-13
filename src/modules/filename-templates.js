import { sanitizeFilename } from './validation.js';

/**
 * Apply a filename template like "{track} - {artist} - {title}".
 * Empty placeholders collapse together with one adjacent separator run.
 * @param {string} template
 * @param {Record<string, string>} tags normalized tag model
 * @param {string} ext extension without dot
 * @returns {string} sanitized filename with extension
 */
export function applyTemplate(template, tags, ext) {
  const values = {
    artist: tags.artist ?? '',
    title: tags.title ?? '',
    album: tags.album ?? '',
    genre: tags.genre ?? '',
    year: tags.year ?? '',
    track: tags.track ? String(tags.track).padStart(2, '0') : '',
  };
  const SENTINEL = '\u0004';
  let out = template.replace(/\{(\w+)\}/g, (_, key) => (values[key] ? values[key] : SENTINEL));
  /* eslint-disable no-control-regex */
  out = out
    .replace(/\u0004\s*[-–—_.]+\s*/g, '')
    .replace(/\s*[-–—_.]+\s*\u0004/g, '')
    .replace(/\u0004/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—_.]+|[\s\-–—_.]+$/g, '');
  /* eslint-enable no-control-regex */
  const safe = sanitizeFilename(out);
  return `${safe}.${ext}`;
}

/**
 * Parse tag values out of a filename using a template ("{artist} - {title}").
 * @param {string} template
 * @param {string} filename without extension
 * @returns {Record<string,string>|null} extracted fields or null if no match
 */
export function parseFilename(template, filename) {
  const keys = [];
  const pattern = template
    .replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '{' || m === '}' ? m : `\\${m}`))
    .replace(/\{(\w+)\}/g, (_, key) => { keys.push(key); return '(.+?)'; });
  const re = new RegExp(`^${pattern}$`);
  const m = filename.match(re);
  if (!m) return null;
  const out = {};
  keys.forEach((k, i) => { out[k] = m[i + 1].trim(); });
  if (out.track) out.track = out.track.replace(/^0+(?=\d)/, '');
  return out;
}

/**
 * Ensure unique names within one export batch by appending " (n)".
 * @param {string[]} names
 * @returns {string[]} same length, unique
 */
export function uniquifyNames(names) {
  const seen = new Map();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    let n = seen.get(name.toLowerCase()) ?? 0;
    while (seen.has(candidate.toLowerCase())) {
      n += 1;
      candidate = `${base} (${n})${ext}`;
    }
    seen.set(name.toLowerCase(), n);
    seen.set(candidate.toLowerCase(), 0);
    return candidate;
  });
}
