import { describe, it, expect } from 'vitest';
import { applyTemplate, parseFilename, uniquifyNames } from '../src/modules/filename-templates.js';

describe('applyTemplate', () => {
  const tags = { artist: 'ACME', title: 'Song', track: '3', album: 'LP' };
  it('substitutes placeholders', () => {
    expect(applyTemplate('{artist} - {title}', tags, 'mp3')).toBe('ACME - Song.mp3');
  });
  it('pads track numbers', () => {
    expect(applyTemplate('{track} - {title}', tags, 'mp3')).toBe('03 - Song.mp3');
  });
  it('collapses empty placeholders', () => {
    expect(applyTemplate('{track} - {artist} - {title}', { title: 'Solo' }, 'wav')).toBe('Solo.wav');
  });
  it('sanitizes forbidden characters from values', () => {
    expect(applyTemplate('{title}', { title: 'a/b:c' }, 'mp3')).toBe('a_b_c.mp3');
  });
  it('never produces an empty base name', () => {
    expect(applyTemplate('{artist}', {}, 'mp3')).toBe('untitled.mp3');
  });
});

describe('parseFilename', () => {
  it('extracts fields', () => {
    expect(parseFilename('{artist} - {title}', 'AC DC - Back In Black'))
      .toEqual({ artist: 'AC DC', title: 'Back In Black' });
  });
  it('extracts track/artist/title', () => {
    expect(parseFilename('{track} - {artist} - {title}', '01 - A - B'))
      .toEqual({ track: '1', artist: 'A', title: 'B' });
  });
  it('returns null when not matching', () => {
    expect(parseFilename('{track}. {title}', 'no separator here')).toBeNull();
  });
});

describe('uniquifyNames', () => {
  it('appends suffixes for duplicates', () => {
    expect(uniquifyNames(['a.mp3', 'a.mp3', 'a.mp3'])).toEqual(['a.mp3', 'a (1).mp3', 'a (2).mp3']);
  });
  it('is case-insensitive', () => {
    expect(uniquifyNames(['A.mp3', 'a.mp3'])[1]).toBe('a (1).mp3');
  });
  it('keeps already-unique names', () => {
    expect(uniquifyNames(['x.mp3', 'y.mp3'])).toEqual(['x.mp3', 'y.mp3']);
  });
});
