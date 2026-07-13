import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        console: 'readonly', URL: 'readonly', Blob: 'readonly', File: 'readonly',
        FileReader: 'readonly', fetch: 'readonly', localStorage: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        createImageBitmap: 'readonly', OffscreenCanvas: 'readonly',
        AbortController: 'readonly', CustomEvent: 'readonly', setTimeout: 'readonly',
        clearTimeout: 'readonly', crypto: 'readonly', matchMedia: 'readonly',
        HTMLElement: 'readonly', KeyboardEvent: 'readonly', PointerEvent: 'readonly',
        DataTransfer: 'readonly', ClipboardEvent: 'readonly', structuredClone: 'readonly',
        TextEncoder: 'readonly', TextDecoder: 'readonly', performance: 'readonly',
        process: 'readonly', Buffer: 'readonly', globalThis: 'readonly',
        DOMException: 'readonly', Node: 'readonly', atob: 'readonly', Event: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
    },
  },
];
