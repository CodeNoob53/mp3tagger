# Architecture

## Overview

Aurela Tag Studio is a fully client-side Vite + Vanilla JS (ES Modules) app. There is no backend: files are read with the File API, transformed in memory, and downloaded as new Blobs. **Original files on disk are never modified.**

```
index.html            semantic skeleton (header/main/section/form/dialog/footer)
src/
  main.js             entry: wires components, export actions, session cleanup
  styles/             reset → variables (theming) → base → layout → components → utilities → responsive
  modules/            logic, no DOM assumptions (except where noted)
    app-state.js          state container + pub/sub events
    file-manager.js       import, dedupe, format detection, AppFile model
    audio-metadata-reader.js  music-metadata (lazy) + RIFF chunk table
    mp3-tag-service.js    mp3tag.js (lazy): ID3v2.3/2.4 write, frame mapping
    wav-tag-service.js    model→INFO mapping, id3-chunk option, compat levels
    riff.js               RIFF parser/writer (byte-preserving)
    id3-encoder.js        minimal standalone ID3v2.3 encoder (for WAV id3 chunk)
    conversion-service.js queue + ffmpeg args + cancellation + MEMFS cleanup
    ffmpeg-loader.js      lazy single-thread core via CDN, terminate/release
    image-loader.js       decode + type/size guards
    image-cropper.js      canvas crop editor (pointer/wheel/pinch/keyboard)
    image-compressor.js   render + quality/resolution search under byte budget
    validation.js         pure validators, sanitizers, cover budget
    filename-templates.js apply/parse/uniquify
    batch-editor.js       batch plan → preview → apply (pure)
    download-manager.js   downloads + fflate ZIP (lazy)
    notifications.js      toasts + centralized error reporting
    theme-manager.js      light/dark + system preference
    object-url-manager.js tracked create/revoke of Blob URLs
    utils.js              h(), formatters, debounce
  components/           DOM wiring per UI region (ids live in index.html)
```

## Data model

`AppFile` (see JSDoc in file-manager.js) holds: the original `File`, detected `format` (magic bytes, extension not trusted), technical `meta`, a **normalized tag model** (`tags`), an `originalTags` snapshot for revert, current `cover` bytes, WAV chunk info, status, warnings, and the prepared `output` Blob.

The normalized tag model is format-agnostic. Mapping happens at write time:
- MP3: `mp3-tag-service.js` maps to ID3v2 frames (TIT2, TPE1, …, COMM, USLT, WXXX, POPM, APIC). v2.3 uses TYER + TXXX:MOOD; v2.4 uses TDRC + TMOO.
- WAV: `wav-tag-service.js` maps to RIFF INFO ids (INAM, IART, …); remaining fields optionally go into an experimental `id3 ` chunk built by `id3-encoder.js`.

## Pipelines

**Read**: File → slice(0,8k) magic-byte sniff → music-metadata parseBlob (tech info + tags + cover) → for WAV additionally riff.js chunk table/INFO/BEXT.

**Tag save (no re-encode)**:
- MP3: mp3tag.js parses the existing tag, our model is merged over it (unknown frames preserved), tag block re-serialized, audio bytes copied verbatim. Verified by tests comparing the post-tag audio stream byte-for-byte.
- WAV: riff.js copies every chunk verbatim except `LIST INFO`/`id3 `, which are rebuilt and appended after `data`.

**Convert**: lazy-load FFmpeg (single-thread core, own worker) → write input to MEMFS → `exec` → read output → delete MEMFS files → re-apply the tag model to the output container. Queue concurrency = 1; cancel = worker terminate; heap released 60 s after the queue drains.

**Cover**: decode (createImageBitmap) → interactive square crop → render at chosen resolution → JPEG quality/resolution search under `min(1 MB, 5% of audio)` budget (user-overridable, cover may never exceed audio size) → EXIF stripped by canvas re-encode.

## State & events

`app-state.js` exposes a small pub/sub (`files-changed`, `file-updated`, `selection-changed`, `active-changed`). Components subscribe and re-render their region from state; no component talks to another directly.

## Error handling

`notifications.reportError(err, {file, action, originalIntact})` is the single funnel: logs the raw error, shows a toast that states what failed, which file, and that the original is untouched. Services throw typed `Error`s with user-comprehensible messages; `AbortError` marks user cancellation.

## Memory

- Blob URLs only via object-url-manager (revoked on remove/clear/pagehide).
- Full file buffers are read on demand (`file.arrayBuffer()`), not retained.
- FFmpeg MEMFS deleted per job; worker terminated after idle.
- Import cap 1.5 GB, warning at 200 MB.
