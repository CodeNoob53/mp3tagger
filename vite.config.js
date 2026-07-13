import { defineConfig } from 'vite';

/**
 * Base path:
 *  - dev: '/'
 *  - production: VITE_BASE env var if set, otherwise '/mp3tagger/' (GitHub project pages).
 *    For a root user page (username.github.io) build with: VITE_BASE=/ npm run build
 */
export default defineConfig(({ command, isPreview }) => ({
  base: (command === 'build' || isPreview) ? (process.env.VITE_BASE ?? '/mp3tagger/') : '/',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  optimizeDeps: {
    // ffmpeg packages spawn their own worker; pre-bundling breaks worker URL resolution
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
}));
