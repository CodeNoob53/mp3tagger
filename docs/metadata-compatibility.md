# Metadata Compatibility

## MP3 (ID3v2)

Default write target: **ID3v2.3, UTF-16** — the only version Windows Explorer / Windows Media Player parse. ID3v2.4 (UTF-8, TDRC) is selectable in the MP3 options. Existing frames we don't manage (TXXX, private frames, …) are preserved on save. The MPEG audio stream is copied byte-for-byte.

| App field | v2.3 frame | v2.4 frame | Notes |
|---|---|---|---|
| Title / Artist / Album / Album artist | TIT2 / TPE1 / TALB / TPE2 | same | |
| Track, Total tracks | TRCK `n/total` | same | |
| Disc, Total discs | TPOS `n/total` | same | |
| Year | TYER | TDRC | converted automatically |
| Genre / Composer / Conductor / Remixer | TCON / TCOM / TPE3 / TPE4 | same | |
| Grouping / Subtitle | TIT1 / TIT3 | same | |
| Original artist / album | TOPE / TOAL | same | |
| BPM / ISRC / Language | TBPM / TSRC / TLAN | same | validated before write |
| Publisher / Copyright / Encoded by | TPUB / TCOP / TENC | same | |
| Mood | TXXX:MOOD | TMOO | TMOO is v2.4-only |
| Comment | COMM (lang from Language field) | same | |
| Lyrics | USLT | same | |
| URL | WXXX | same | |
| Rating | POPM (WMP scale 0/1/64/128/196/255) | same | Explorer/WMP read it; VLC & Apple Music ignore POPM |
| Cover | APIC type 3, JPEG/PNG only | same | WebP is transcoded before embedding |

### Known limitations
- **Astral-plane characters (emoji)** are dropped by the mp3tag.js writer (surrogate pairs are not encoded). The UI warns before saving. Cyrillic/CJK/Greek (BMP) are fine — covered by tests.
- POPM star mapping is approximate across players (WMP semantics used).

## WAV (RIFF)

`fmt `, `data`, `bext`, `cue `, and all unknown chunks are copied **byte-for-byte**; only `LIST INFO` and `id3 ` are rebuilt. Verified by unit tests and a real 41 MB file.

| App field | INFO id | Compatibility |
|---|---|---|
| Title | INAM | **high** |
| Artist | IART | **high** |
| Album | IPRD | **high** |
| Genre | IGNR | **high** |
| Year | ICRD | **high** |
| Comment | ICMT | **high** |
| Copyright | ICOP | **high** |
| Track | ITRK | limited (common but non-original-spec) |
| Encoded by | ISFT | limited |
| Subtitle | ISBJ | limited |
| ISRC | ISRC | limited (id officially means "source") |
| Language | ILNG | limited |
| Composer | IMUS | limited |
| Publisher | ICMS | limited (officially "commissioned") |
| Everything else (album artist, disc, BPM, lyrics, URL, mood, rating, …) | — | **experimental**: only via the optional `id3 ` chunk |

### WAV caveats (shown in the UI)
1. **Encoding**: RIFF INFO has no standard text encoding. We write UTF-8 (like foobar2000/Mp3tag in UTF-8 mode); players assuming Latin-1/system codepage will garble non-ASCII text. The UI warns when non-ASCII values go into INFO.
2. **Cover art**: no standard exists. Options offered: experimental `id3 ` chunk (VLC, foobar2000, MusicBee read it; Windows ignores it), export `cover.jpg` next to the file, or convert to a tag-friendly format.
3. **BEXT** is read-only: description/originator/date are displayed and the chunk is preserved verbatim on save.
4. An existing `id3 ` chunk is detected and reported; it is replaced only when the id3 option is enabled, otherwise removed ONLY if it was our own target — unknown chunks are never silently dropped (the `id3 ` chunk is rebuilt from the current model when enabled, removed when the model is saved without the option — the UI states this).

## Player matrix

See `docs/research.md` §8 for the full per-player table (Explorer/WMP, VLC, foobar2000, MusicBee, Apple Music, Android, browsers).
