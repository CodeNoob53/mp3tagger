/**
 * Batch editing rules and preview computation. Pure functions — unit-tested.
 * Rule: an empty batch field never clears an existing value; clearing
 * requires the explicit `clear` flag for that field.
 */
import { applyTemplate, parseFilename } from './filename-templates.js';

export const BATCH_FIELDS = [
  'artist', 'album', 'albumArtist', 'genre', 'year', 'composer', 'copyright', 'publisher',
];

/**
 * @typedef {Object} BatchPlan
 * @property {Record<string,string>} set fields with non-empty new values
 * @property {Set<string>} clear fields to erase explicitly
 * @property {boolean} autoNumber assign track = index+1 / total
 * @property {string} [titleTemplate] parse filename into tags with this template
 * @property {string} [nameTemplate] rename output files from tags
 */

/**
 * Compute the per-file change preview for a batch plan.
 * @param {import('./file-manager.js').AppFile[]} files
 * @param {BatchPlan} plan
 * @returns {{ fileId: string, name: string, changes: { field: string, from: string, to: string }[], newName: string|null, conflicts: string[] }[]}
 */
export function previewBatch(files, plan) {
  return files.map((f, index) => {
    const changes = [];
    const conflicts = [];
    const nextTags = { ...f.tags };

    if (plan.titleTemplate) {
      const base = f.name.replace(/\.[^.]+$/, '');
      const parsed = parseFilename(plan.titleTemplate, base);
      if (parsed) {
        for (const [field, value] of Object.entries(parsed)) {
          if (value && value !== nextTags[field]) {
            changes.push({ field, from: nextTags[field] ?? '', to: value });
            nextTags[field] = value;
          }
        }
      } else {
        conflicts.push(`Filename does not match template "${plan.titleTemplate}"`);
      }
    }

    for (const [field, value] of Object.entries(plan.set)) {
      if (!value) continue;
      if (nextTags[field] !== value) {
        changes.push({ field, from: nextTags[field] ?? '', to: value });
        nextTags[field] = value;
      }
    }
    for (const field of plan.clear) {
      if (nextTags[field]) {
        changes.push({ field, from: nextTags[field], to: '' });
        nextTags[field] = '';
      }
    }
    if (plan.autoNumber) {
      const to = String(index + 1);
      if (nextTags.track !== to) {
        changes.push({ field: 'track', from: nextTags.track ?? '', to });
        nextTags.track = to;
      }
      const total = String(files.length);
      if (nextTags.totalTracks !== total) {
        changes.push({ field: 'totalTracks', from: nextTags.totalTracks ?? '', to: total });
        nextTags.totalTracks = total;
      }
    }

    let newName = null;
    if (plan.nameTemplate) {
      const ext = f.format;
      newName = applyTemplate(plan.nameTemplate, nextTags, ext);
      if (/^untitled/.test(newName)) conflicts.push('Template produces an empty name (missing tag values).');
    }

    return { fileId: f.id, name: f.name, changes, newName, conflicts, nextTags };
  });
}

/**
 * Apply a computed preview to the real files (mutates tags / name, marks dirty).
 * @param {import('./file-manager.js').AppFile[]} files
 * @param {ReturnType<typeof previewBatch>} preview
 * @returns {number} number of files changed
 */
export function applyBatch(files, preview) {
  const byId = new Map(files.map((f) => [f.id, f]));
  let changed = 0;
  for (const row of preview) {
    const f = byId.get(row.fileId);
    if (!f) continue;
    if (row.changes.length > 0 || row.newName) {
      f.tags = { ...row.nextTags };
      if (row.newName) f.name = row.newName;
      f.status = 'dirty';
      changed += 1;
    }
  }
  return changed;
}
