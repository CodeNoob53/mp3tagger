import { describe, it, expect } from 'vitest';
import { previewBatch, applyBatch } from '../src/modules/batch-editor.js';

const mkFile = (id, name, tags = {}) => ({ id, name, format: 'mp3', tags: { ...tags }, status: 'ready' });

describe('previewBatch', () => {
  it('empty fields never clear existing values', () => {
    const files = [mkFile('1', 'a.mp3', { artist: 'Keep Me' })];
    const preview = previewBatch(files, { set: {}, clear: new Set(), autoNumber: false });
    expect(preview[0].changes).toEqual([]);
    expect(preview[0].nextTags.artist).toBe('Keep Me');
  });

  it('explicit clear erases the field', () => {
    const files = [mkFile('1', 'a.mp3', { artist: 'Old' })];
    const preview = previewBatch(files, { set: {}, clear: new Set(['artist']), autoNumber: false });
    expect(preview[0].nextTags.artist).toBe('');
    expect(preview[0].changes[0]).toMatchObject({ field: 'artist', from: 'Old', to: '' });
  });

  it('set overrides values and reports the diff', () => {
    const files = [mkFile('1', 'a.mp3', { album: 'X' }), mkFile('2', 'b.mp3', { album: 'Y' })];
    const preview = previewBatch(files, { set: { album: 'Z' }, clear: new Set(), autoNumber: false });
    expect(preview.every((p) => p.nextTags.album === 'Z')).toBe(true);
    expect(preview[0].changes[0].from).toBe('X');
  });

  it('auto-numbers tracks in list order', () => {
    const files = [mkFile('1', 'a.mp3'), mkFile('2', 'b.mp3'), mkFile('3', 'c.mp3')];
    const preview = previewBatch(files, { set: {}, clear: new Set(), autoNumber: true });
    expect(preview.map((p) => p.nextTags.track)).toEqual(['1', '2', '3']);
    expect(preview.map((p) => p.nextTags.totalTracks)).toEqual(['3', '3', '3']);
  });

  it('parses tags from filenames via template', () => {
    const files = [mkFile('1', 'ACME - Hit.mp3')];
    const preview = previewBatch(files, { set: {}, clear: new Set(), autoNumber: false, titleTemplate: '{artist} - {title}' });
    expect(preview[0].nextTags).toMatchObject({ artist: 'ACME', title: 'Hit' });
  });

  it('reports a conflict when the filename does not match', () => {
    const files = [mkFile('1', 'nomatch.mp3')];
    const preview = previewBatch(files, { set: {}, clear: new Set(), autoNumber: false, titleTemplate: '{track}. {title}' });
    expect(preview[0].conflicts.length).toBe(1);
  });

  it('renames from tags with template', () => {
    const files = [mkFile('1', 'old.mp3', { artist: 'A', title: 'T' })];
    const preview = previewBatch(files, { set: {}, clear: new Set(), autoNumber: false, nameTemplate: '{artist} - {title}' });
    expect(preview[0].newName).toBe('A - T.mp3');
  });
});

describe('applyBatch', () => {
  it('mutates only files with changes', () => {
    const files = [mkFile('1', 'a.mp3', { artist: 'same' }), mkFile('2', 'b.mp3')];
    const preview = previewBatch(files, { set: { artist: 'same' }, clear: new Set(), autoNumber: false });
    const changed = applyBatch(files, preview);
    expect(changed).toBe(1);
    expect(files[0].status).toBe('ready');
    expect(files[1].status).toBe('dirty');
    expect(files[1].tags.artist).toBe('same');
  });
});
