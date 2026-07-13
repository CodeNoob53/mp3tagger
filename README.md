# Aurela Tag Studio

Professional browser-based **MP3/WAV metadata editor and audio converter**. Everything runs locally in your browser — no backend, no uploads, deployable as a static site on GitHub Pages.

## Features

- **Import** MP3/WAV by drag-and-drop or file dialog; the real format is detected from file content (a `.mp3` that is actually WAV is handled correctly and reported).
- **MP3 tagging (ID3v2.3 / ID3v2.4)** — 28 fields: title, artist, album, album artist, track/total, disc/total, year, genre, composer, comment, copyright, publisher, encoded-by, BPM, ISRC, language, lyrics, URL, grouping, subtitle, conductor, remixer, original artist/album, mood, rating (POPM), cover art. Unknown existing frames are preserved. **The audio stream is never re-encoded when you edit tags** (verified byte-for-byte by tests).
- **WAV tagging** — standard RIFF LIST-INFO fields with honest per-field compatibility levels (high / limited / experimental); `fmt `, `data`, `bext` and unknown chunks are preserved byte-for-byte; optional experimental `id3 ` chunk for fields INFO cannot store; per-file chunk inventory.
- **Cover art editor** — drop / paste / browse; square crop with pan, wheel zoom, pinch, 90° rotation, keyboard control; presets 300/500/800/1000 px; automatic JPEG optimization under a smart limit `min(1 MB, 5% of audio size)` (configurable, and a cover may never exceed the audio itself); EXIF removed; before/after size stats.
- **Conversion** (lazy-loaded ffmpeg.wasm, ~31 MB downloaded once on first use):
  - **MP3 → WAV** — decoding to PCM (16/24-bit, sample-rate and channel options). *No additional quality loss, but WAV cannot restore what MP3 encoding already discarded — the file just gets much bigger.*
  - **WAV → MP3** — lossy encoding, CBR 128/192/256/320 kbps or LAME VBR V0–V6 (default 320 CBR).
  - Progress, cancellation, queue, memory cleanup after every job.
- **Batch editing** — apply artist/album/genre/etc. to many files with a preview diff (empty fields never erase values; clearing is an explicit checkbox), track auto-numbering, tags-from-filename and filename-from-tags templates (`{artist} - {title}`, custom, …).
- **Export** — single files or ZIP; forbidden characters cleaned, name collisions get ` (n)` suffixes; **your original files are never modified**.
- Light/dark theme, responsive desktop-first UI, keyboard navigation, `aria-live` progress, `prefers-reduced-motion` respected.

## Privacy

- All processing happens **locally in your browser**. Audio and images are never uploaded anywhere.
- GitHub Pages only delivers the static app files.
- No analytics, no tracking.
- The only post-load network request is the **one-time FFmpeg engine download** from jsDelivr when you first convert (verifiable in DevTools → Network).

## Supported formats

| | Read | Write tags | Convert to |
|---|---|---|---|
| MP3 | ✅ ID3v1/v2.2/v2.3/v2.4 | ✅ ID3v2.3 (default) / v2.4 | WAV |
| WAV | ✅ RIFF INFO, BEXT, id3 chunk | ✅ INFO (+ experimental id3 chunk) | MP3 |

FLAC is under consideration as a lossless, properly-taggable alternative to WAV — see `docs/research.md` §9.

## Local development

```bash
npm install
npm run fixtures   # generate synthetic test audio (once)
npm test           # 70+ unit/integration tests
npm run dev        # http://localhost:5173
```

## Production build

```bash
npm run build      # outputs dist/ (base defaults to /mp3tagger/)
npm run preview    # serve the production build locally
```

Override the base path when needed (PowerShell): `$env:VITE_BASE="/"; npm run build`

## Deployment (GitHub Pages)

Deployment is automated with GitHub Actions — `dist` is never committed:

1. Push to GitHub, branch `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` builds, tests and deploys to `https://<user>.github.io/<repo>/`.

Details, root-page setup and self-hosting the FFmpeg core: [`docs/deployment.md`](docs/deployment.md).

## Browser support

Evergreen Chrome/Edge ≥ 105, Firefox ≥ 110, Safari ≥ 16 (needs `<dialog>`, `createImageBitmap`, ES2022, WASM). No IE.

## Honest notes about quality and metadata

- **MP3 → WAV is not an upgrade**: decoding is bit-faithful to the MP3, but data already discarded by lossy encoding is gone forever.
- **WAV → MP3 is lossy** — the UI says so before you convert.
- **WAV metadata is inherently limited**: RIFF INFO has few fields and no standard text encoding (non-ASCII values are written as UTF-8 and may look garbled in Latin-1 players — the UI warns). There is no standard WAV cover art; the optional `id3 ` chunk works in VLC/foobar2000/MusicBee but is ignored by Windows. Full matrix: [`docs/metadata-compatibility.md`](docs/metadata-compatibility.md).
- **Emoji in tags**: the ID3 writer library drops astral-plane characters; the UI warns. BMP scripts (Cyrillic, CJK, Greek, …) are fully supported and tested.

## Libraries

| Library | Purpose | License |
|---|---|---|
| [music-metadata](https://github.com/Borewit/music-metadata) | reading tags + technical info | MIT |
| [mp3tag.js](https://github.com/eidoriantan/mp3tag.js) | writing ID3v2.3/2.4 | MIT |
| [@ffmpeg/ffmpeg](https://github.com/ffmpegwasm/ffmpeg.wasm) + single-thread core | MP3↔WAV conversion | MIT (FFmpeg core: LGPL) |
| [fflate](https://github.com/101arrowz/fflate) | ZIP export | MIT |
| [Vite](https://vitejs.dev) / [Vitest](https://vitest.dev) | build / tests | MIT |

RIFF parsing/writing and the WAV `id3 ` chunk encoder are custom (~400 lines, fully unit-tested) — see `docs/research.md` for why.

## Documentation

- [`docs/research.md`](docs/research.md) — library research, compatibility matrix, risks
- [`docs/architecture.md`](docs/architecture.md) — modules, data model, pipelines
- [`docs/metadata-compatibility.md`](docs/metadata-compatibility.md) — field-by-field support
- [`docs/testing.md`](docs/testing.md) — automated + manual test plan
- [`docs/deployment.md`](docs/deployment.md) — GitHub Pages, base paths, FFmpeg hosting
- [`CHANGELOG.md`](CHANGELOG.md)
