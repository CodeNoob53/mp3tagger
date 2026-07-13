# Research — Library & Platform Selection

Research date: **2026-07-13**. All repositories, releases and npm pages were checked on this date.

## Goals

Select libraries for a fully client-side MP3/WAV tag editor and converter deployable to GitHub Pages (static hosting, no custom HTTP headers), built with Vite + Vanilla JS (ES Modules).

---

## 1. Reading audio metadata

| Library | Repo | State (2026-07) | License | Bundle impact | Notes |
|---|---|---|---|---|---|
| **music-metadata** | https://github.com/Borewit/music-metadata | Active, v11.x, frequent releases | MIT | ~70–90 KB gz (lazy-loaded chunk) | Reads ID3v1/v2.2/v2.3/v2.4, RIFF/INFO, BEXT (partial), APIC covers, and full technical info (duration, bitrate, sample rate, channels, codec, VBR). Pure ESM ≥ v8, works in browsers without Node polyfills (accepts `Uint8Array`/`Blob`). |
| music-metadata-browser | https://github.com/Borewit/music-metadata-browser | **Deprecated** — superseded by music-metadata ≥ v8 which is browser-ready | MIT | — | Rejected: obsolete wrapper. |
| jsmediatags | https://github.com/aadsm/jsmediatags | Stale (last meaningful release years ago) | BSD-3 | ~30 KB | Rejected: unmaintained, read-only, no WAV. |
| id3js / @catamphetamine/id3js | https://github.com/43081j/id3 | Low activity | MIT | small | Rejected: read-only, ID3 only, no WAV/tech info. |

**Chosen: `music-metadata`** — single dependable parser for both MP3 and WAV, gives the technical info panel for free, actively maintained by Borewit (also maintains strtok3/token-types).

## 2. Writing MP3 tags (ID3v2)

| Library | Repo | State | License | Bundle impact | Write versions | Preserves existing frames? |
|---|---|---|---|---|---|---|
| **mp3tag.js** | https://github.com/eidoriantan/mp3tag.js | Active — v3.17.0 released 2026-06-30, regular releases through 2026 | MIT | ~40 KB gz (lazy) | ID3v1, **ID3v2.3 and ID3v2.4** (selectable via `write({ version })` semantics of the tag object) | **Yes** — parses the whole existing tag, edits are merged, then the tag block is re-serialized; the MPEG audio stream is copied byte-for-byte (no re-encode). |
| browser-id3-writer | https://github.com/egoroof/browser-id3-writer | Active but narrow scope | MIT | ~8 KB | ID3v2.3 only | **No** — explicitly *removes* the existing v2.2/v2.3/v2.4 tag and writes only the frames you set. Violates our "keep unknown frames" requirement. |
| node-id3 | https://github.com/Zazama/node-id3 | Active | MIT | — | v2.3/v2.4 | Node Buffer-centric; needs polyfills in browser. Rejected. |

**Chosen: `mp3tag.js`** — the only maintained browser library that reads *and* writes, supports both v2.3 and v2.4, keeps unrecognized frames, and never touches the audio stream. Its correctness is verified in our test suite against synthetic fixtures (round-trip read-back with music-metadata).

**ID3 version policy:** default write target is **ID3v2.3 / UTF-16**, because Windows Explorer and Windows Media Player (all versions incl. Windows 10/11 shell) do **not** parse ID3v2.4, while every v2.4-capable player also reads v2.3. ID3v2.4 (UTF-8, ISO-8601 dates, TDRC) is offered as an explicit option in the UI. Sources: Microsoft community/Q&A threads on Explorer ID3v2.4 handling; ID3 Wikipedia compatibility section.

## 3. WAV metadata (RIFF INFO / BEXT / ID3 chunk)

| Option | State | License | Notes |
|---|---|---|---|
| wavefile (rochars) | Semi-maintained (sparse commits) | MIT | Reads/writes LIST-INFO, bext, cue. But it **re-serializes the whole file** through its own object model — chunk order and unknown chunks are not guaranteed byte-preserved; heavy API for our narrow need. |
| prx-wavefile | Fork focused on BWF/cart | MIT | Same architecture concern. |
| **Custom RIFF parser/writer** (`src/modules/riff.js`) | — | — | ~300 lines. Parses the chunk table, replaces/appends only `LIST INFO` and `id3 ` chunks, copies `fmt `, `data`, `bext` and all unknown chunks **byte-for-byte**. Fully unit-testable. |

**Chosen: custom RIFF module.** The RIFF container is simple (fourcc + le32 size + payload + pad byte), and byte-preservation of `fmt `/`data`/unknown chunks is a hard requirement (§5 of the spec) that generic re-serializers cannot guarantee. `bext` is read-only in v1 (displayed, preserved verbatim); writing BEXT description fields is listed as future work.

**Cover art in WAV:** there is **no standard** artwork chunk in RIFF. Some tools (foobar2000, Mp3tag) write an `id3 ` chunk containing a full ID3v2 tag with APIC. We support: (a) writing an `id3 ` chunk (marked *experimental* in the UI, off by default), (b) exporting `cover.jpg` alongside, (c) suggesting FLAC conversion. Compatibility level shown per field (see `docs/metadata-compatibility.md`).

## 4. Audio conversion — ffmpeg.wasm

- Packages: `@ffmpeg/ffmpeg` 0.12.x (API layer), `@ffmpeg/util`, core builds `@ffmpeg/core` (single-thread) / `@ffmpeg/core-mt` (multi-thread).
- **Single-thread core (`@ffmpeg/core`)**: no `SharedArrayBuffer` needed → **works on GitHub Pages without COOP/COEP headers**. Runs in a Web Worker internally (the 0.12 API always spawns its own worker → UI is never blocked). WASM download ≈ **31 MB** (core.wasm ~30.7 MB + core.js ~110 KB), cached by the browser after first load.
- **Multi-thread core (`@ffmpeg/core-mt`)**: ~2× faster, but requires cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`). **GitHub Pages cannot set HTTP headers.** The `coi-serviceworker` hack (https://github.com/gzuidhof/coi-serviceworker) can emulate them via a service worker, but it forces a page reload on first visit, breaks when embedded in iframes, and is explicitly a workaround. **Decision: ship single-thread; document coi-serviceworker as an opt-in for self-hosters.**
- **Vite integration:** exclude `@ffmpeg/ffmpeg` and `@ffmpeg/util` from `optimizeDeps`; load the core with `toBlobURL()`. We load the core from jsDelivr CDN at conversion time (lazy) — this avoids shipping 31 MB in the repo/`dist` and is the pattern from official ffmpeg.wasm docs. Self-hosting instructions are in `docs/deployment.md`. No user data ever goes to the CDN — only the FFmpeg binary is downloaded from it.
- **Memory:** WASM heap limit is 2 GB (practically less). Input + output + heap live simultaneously → practical safe input size ≈ 500 MB–1 GB. The app warns at 200 MB and refuses > 1.5 GB. FFmpeg's MEMFS is deleted (`deleteFile`) after every job; the FFmpeg instance is terminated after the queue drains to release the heap.
- **Cancellation:** `ffmpeg.terminate()` kills the worker; the queue then reloads the core for the next job.
- **Encoders:** the default core includes **libmp3lame** (MP3 encode, CBR `-b:a` and VBR `-q:a` 0–9) and `pcm_s16le`/`pcm_s24le` (WAV 16/24-bit). Verified in the official core build config.

Alternative considered: **lamejs** (pure-JS MP3 encoder, ~150 KB) — much smaller, but unmaintained (last release 2016), mono/stereo 16-bit only, no MP3 *decoder* (would still need WebAudio `decodeAudioData`, which resamples to the AudioContext rate and loses the original sample rate control). Rejected as primary; noted as possible fallback.

## 5. Cover-art processing

**Chosen: native Canvas/OffscreenCanvas + `createImageBitmap`** — no library.
- `createImageBitmap(blob)` decodes JPEG/PNG/WebP in all evergreen browsers.
- Canvas re-encode (`canvas.toBlob('image/jpeg', q)`) automatically strips EXIF/ICC/XMP metadata.
- WebP covers are transcoded to JPEG/PNG before embedding (APIC WebP support in players is unreliable).
- Rejected: cropperjs (v2 is web-component-oriented, ~50 KB, we need a custom constrained square editor anyway), pica (only needed for very high-quality downscale; Canvas `imageSmoothingQuality: 'high'` is sufficient for cover sizes ≤ 1000 px).

## 6. ZIP export

| Library | State | License | Size | Notes |
|---|---|---|---|---|
| **fflate** | Active | MIT | ~8 KB gz (zip-only path) | Async, runs in worker, fastest JS zip. Store (level 0) used for audio — already-compressed payloads. |
| jszip | Maintenance mode | MIT/GPL | ~30 KB | Blocks main thread. Rejected. |
| zip.js | Active | BSD | ~50 KB | More than needed. Rejected. |

**Chosen: `fflate`** (`zipSync`/`zip` with `level: 0`).

## 7. GitHub Pages constraints (verified)

- No custom HTTP headers → no COOP/COEP → no SharedArrayBuffer → single-thread FFmpeg core (see §4).
- MIME types: GitHub Pages serves `.wasm` as `application/wasm` and `.js` as `text/javascript` correctly — no issue.
- `base`: project pages live at `https://<user>.github.io/<repo>/` → Vite `base: '/mp3tagger/'`, overridable via `VITE_BASE` env var (root user pages need `base: '/'`).
- SPA fallback: **not needed** — the app is a single `index.html`, no client-side routing.
- Deployment: official GitHub Actions flow (`actions/upload-pages-artifact` + `actions/deploy-pages`) publishes `dist/` directly; **`dist` is never committed to git**.
- Artifact size limits are irrelevant since FFmpeg core is not bundled.

## 8. Tag compatibility matrix (players, 2026)

| Field / feature | Explorer / WMP | VLC | foobar2000 | MusicBee | Apple Music/iTunes | Android players | Browsers (`<audio>` + MediaSession) |
|---|---|---|---|---|---|---|---|
| ID3v2.3 core fields (TIT2/TPE1/TALB/TRCK/TYER/TCON) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (via parsing libs) |
| ID3v2.4 (UTF-8, TDRC) | ❌ shell ignores tag | ✅ | ✅ | ✅ | ✅ | mostly ✅ | ✅ |
| APIC cover (JPEG) | ✅ (v2.3) | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| APIC cover (PNG) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| APIC cover (WebP) | ❌ | partial | partial | partial | ❌ | varies | n/a — **we never write WebP into tags** |
| POPM rating | ✅ (WMP semantics) | ❌ ignore | ✅ | ✅ | ❌ | varies | n/a |
| Lyrics (USLT) | ❌ | ✅ | ✅ | ✅ | ✅ | varies | n/a |
| WAV LIST-INFO (INAM/IART/IPRD/…) | partial (Explorer shows some) | ✅ | ✅ | ✅ | ❌ mostly | rarely | n/a |
| WAV `id3 ` chunk | ❌ | ✅ | ✅ | ✅ | partial | rarely | n/a |
| WAV BEXT | ❌ (pro tools only) | ❌ | component | ❌ | ❌ | ❌ | n/a |

Consequences: (1) default ID3v2.3; (2) covers always JPEG or PNG; (3) WAV UI labels INFO fields "high/limited" and `id3 ` chunk "experimental"; (4) Rating written as POPM with WMP-compatible values, documented as approximate.

## 9. FLAC as a lossless alternative (investigated, not implemented in v1)

FLAC gives real tagging (Vorbis comments + PICTURE block) and ~50 % size of WAV, losslessly. The default ffmpeg.wasm core includes the FLAC encoder, so `WAV → FLAC` is technically one command away. Not enabled in v1 to keep the tested scope honest (tag writing for FLAC would need another library — e.g. `flac-metadata` is unmaintained). The conversion panel mentions FLAC in the WAV-limitations help text; implementation is listed in "next steps".

## 10. Final selection

| Concern | Choice | Why |
|---|---|---|
| Read tags + tech info (MP3+WAV) | music-metadata v11 | maintained, browser ESM, one parser for everything |
| Write MP3 tags | mp3tag.js v3.17 | v2.3+v2.4, preserves unknown frames, no re-encode |
| Write WAV tags | custom `riff.js` | byte-preservation guarantee, testable |
| Convert | @ffmpeg/ffmpeg 0.12 + single-thread core via CDN | GH-Pages-compatible, worker-based, lazy 31 MB |
| Covers | Canvas/OffscreenCanvas | zero deps, EXIF stripped by design |
| ZIP | fflate | 8 KB, async |
| Build | Vite 7 | current stable |
| Tests | Vitest | Vite-native |

## 11. Known risks

1. **31 MB FFmpeg download** on first conversion — mitigated by explicit progress UI + browser cache; documented.
2. mp3tag.js is a single-maintainer project — mitigated by round-trip tests in CI; API surface we use is small.
3. WAV `id3 ` chunk support in players is inconsistent — feature is opt-in and labelled experimental.
4. Canvas `toBlob('image/jpeg')` quality mapping differs slightly per browser — the compressor iterates on actual output size, not assumed quality curves.
5. Very large WAV (> 1.5 GB) exceeds practical WASM memory — hard-blocked with a clear message.

## 12. Findings from implementation testing (2026-07-13)

These were discovered while testing against synthetic fixtures and real files and are asserted by the test suite:

1. **mp3tag.js drops astral-plane characters** (emoji, U+10000+) in both v2.3 (UTF-16 surrogates not encoded) and v2.4 (UTF-8 path); BMP scripts (Cyrillic, CJK, Greek) survive round-trips. The UI warns before saving such values.
2. **mp3tag.js POPM requires a syntactically valid email** in strict mode — we write `rating@aurela.app` as the conventional identifier.
3. **mp3tag.js expects USLT/COMM/TXXX/APIC as arrays** of frame objects.
4. **music-metadata strips the high bit when decoding RIFF INFO text**, so non-ASCII INFO written as UTF-8 (our choice, same as modern taggers) is unrecoverable through it. Our own RIFF reader decodes UTF-8 correctly; players vary (Latin-1 vs UTF-8). The UI warns when non-ASCII values go into INFO and recommends the id3 chunk for Unicode.
