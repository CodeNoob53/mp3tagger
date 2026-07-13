# Changelog

## 1.0.0 — 2026-07-13

Initial release.

- Import MP3/WAV via drag-and-drop or file dialog; real format detected from magic bytes, extension mismatches reported.
- Full technical info panel (duration, bitrate, sample rate, channels, bit depth, tag types).
- MP3: read + write ID3v2.3 (default, Windows-compatible) and ID3v2.4; 28 fields incl. lyrics, URL, POPM rating; unknown frames preserved; audio stream never re-encoded (byte-verified).
- WAV: byte-preserving RIFF rewrite; standard LIST-INFO fields with per-field compatibility levels; BEXT read + preservation; optional experimental `id3 ` chunk for the fields INFO lacks; chunk inventory in the UI.
- Cover art editor: drop/paste/file, square crop with pan/zoom/pinch/rotate/keyboard, presets 300–1000 px, automatic JPEG compression under `min(1 MB, 5% of audio)` (user-overridable), EXIF stripped, honest size statistics, refusal to compress below acceptable quality.
- Conversion via lazy-loaded ffmpeg.wasm (single-thread core, GitHub-Pages-compatible): MP3→WAV (sample rate / bit depth / channels), WAV→MP3 (CBR 128–320, VBR V0–V6), progress, cancellation, queue, MEMFS cleanup.
- Batch editing with preview (empty fields never clear values), track auto-numbering, filename↔tag templates, per-file or ZIP export with name de-duplication.
- Light/dark theme, responsive layout, keyboard accessibility, aria-live progress and toasts.
- 74 automated tests incl. round-trips on synthetic fixtures and real files.

Known limitations: emoji (astral plane) dropped by the ID3 writer; RIFF INFO Unicode depends on the reading player; FLAC support planned.
