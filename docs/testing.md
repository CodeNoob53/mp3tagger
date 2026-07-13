# Testing

## Running

```bash
npm run fixtures   # generate synthetic audio fixtures (required once)
npm test           # vitest run (unit + integration + DOM smoke)
npm run lint       # eslint
```

## Test suites

| File | Coverage |
|---|---|
| tests/validation.test.js | sanitizers, all field validators, cover byte budget |
| tests/filename-templates.test.js | template apply/parse, empty-placeholder collapse, unique names |
| tests/riff.test.js | RIFF parse, INFO/BEXT/id3 read, byte-preservation of fmt/data/unknown chunks, INFO replace semantics, Unicode round-trip |
| tests/mp3-roundtrip.test.js | every ID3 field v2.3+v2.4, audio-stream byte equality (no re-encode), unknown-frame preservation, BMP Unicode, cover keep/remove, duration stability, corrupted input |
| tests/batch-editor.test.js | empty-field-never-clears rule, explicit clear, auto-numbering, filename→tags, tags→filename, conflicts |
| tests/misc.test.js | ffmpeg argument builder, standalone ID3 encoder (parsed back by music-metadata), object-URL leak tracking |
| tests/app-smoke.test.js | happy-dom bootstrap of all components against the real index.html |
| tests/real-files.test.js | integration on real user files in `.tmp/` (auto-skipped when absent, e.g. CI) |

## Fixtures

`npm run fixtures` writes synthetic files to `tests/fixtures/generated/` (git-ignored, no copyrighted audio):

- mp3-no-tags.mp3 — bare MPEG frames
- mp3-id3v23.mp3 — v2.3 tag + custom TXXX frame (preservation test)
- mp3-id3v24.mp3 — v2.4 tag with TDRC
- mp3-unicode.mp3 — Cyrillic/CJK title
- mp3-big-cover.mp3 — ~300 KB PNG APIC
- wav-plain.wav / wav-info.wav / wav-bext.wav / wav-id3.wav / wav-unknown-chunk.wav — sine-wave PCM with the respective metadata chunks
- corrupted.mp3 — truncated garbage
- wrong-ext.mp3 — WAV bytes with an .mp3 extension (format-sniffing test)

## Manual checklist (per release)

1. Import MP3 + WAV together; verify table info (duration/bitrate/sample rate).
2. Edit tags on MP3, save, download; re-import the download — values and cover intact, duration identical.
3. Verify saved MP3 plays (browser `<audio>`, VLC) and shows tags in Explorer (v2.3).
4. Cover: drop, paste, crop, rotate, presets; verify size stats and limit behavior with a tiny MP3.
5. Convert MP3→WAV and WAV→MP3, cancel mid-run, convert again; check the queue UI and that the app stays responsive.
6. WAV: save INFO, re-import, chunks list intact (bext/unknown preserved).
7. Batch: select 3+ files, preview, apply, export ZIP; check unique names.
8. Hard refresh mid-session (no crash on reload); DevTools Network shows no uploads (only the one-time FFmpeg CDN fetch).
9. Keyboard-only pass: import→edit→save→download without a mouse.
10. Lighthouse (a11y ≥ 95) and axe scan on the main states.
11. Memory: repeat save/convert 10×, watch DevTools memory — no unbounded growth (object-url-manager count returns to baseline after Clear session).
