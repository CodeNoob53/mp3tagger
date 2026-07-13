# Deployment

## GitHub Pages via Actions (recommended)

`dist/` is **not** committed. The workflow `.github/workflows/deploy.yml` builds and publishes on every push to `main`.

1. Push the repository to GitHub (`main` branch).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site appears at
   `https://<username>.github.io/<repository-name>/`.

The workflow passes `VITE_BASE=/<repo-name>/` automatically, so a fork or rename keeps working.

### Root user page (`username.github.io`)

For a repository named `<username>.github.io`, the site is served from `/`. Edit the `VITE_BASE` env in the workflow (or build locally) to `/`:

```yaml
      - name: Build
        run: npm run build
        env:
          VITE_BASE: /
```

### Local base override

```powershell
# PowerShell (Windows)
$env:VITE_BASE = "/"; npm run build
# or for a project page
$env:VITE_BASE = "/mp3tagger/"; npm run build
```

## Why the FFmpeg core is not bundled

The single-thread `@ffmpeg/core` (~31 MB) is fetched from jsDelivr at first conversion and cached by the browser. This keeps the Pages artifact tiny and avoids re-shipping FFmpeg on every deploy. To self-host instead: copy `node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.{js,wasm}` into `public/ffmpeg/` and change `CORE_BASE` in `src/modules/ffmpeg-loader.js` to `${import.meta.env.BASE_URL}ffmpeg/`. GitHub Pages serves `.wasm` with the correct MIME type.

## Single-thread vs multi-thread FFmpeg

GitHub Pages cannot send `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers, so `SharedArrayBuffer` (required by the ~2× faster multi-thread core) is unavailable. If you host on a server where you control headers (Netlify/Vercel/nginx), you can switch to `@ffmpeg/core-mt`; the `coi-serviceworker` hack also exists for static hosts but forces a first-visit reload and breaks iframes — deliberately not used here.

## Committing dist/ instead (not recommended)

If Actions are unavailable you can deploy from a branch: remove `dist/` from `.gitignore`, run `npm run build`, commit, and point Pages at the branch/folder. Trade-offs: binary diffs bloat history, stale builds are easy to ship, and every contributor needs to remember to rebuild. `npm run deploy` (gh-pages package via npx) automates a variant of this by pushing `dist` to a `gh-pages` branch.

## SPA fallback

Not needed — the app is a single `index.html` without client-side routing; a hard refresh always works.

## Post-deploy verification

1. Open the Pages URL, hard-refresh, check DevTools Console — no errors, no 404 assets.
2. Import a local MP3 — Network tab must show **zero** requests with file data.
3. Run one conversion — the only network activity is the FFmpeg core download from jsDelivr (cached afterwards).
