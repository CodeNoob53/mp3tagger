// @vitest-environment happy-dom
/**
 * Smoke test: the full UI wiring initializes against the real index.html
 * without throwing (catches missing element ids and import-time errors).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('app bootstrap', () => {
  it('initializes all components against index.html', async () => {
    const html = readFileSync(join(root, 'index.html'), 'utf-8');
    const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
    document.body.innerHTML = body;

    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));

    const { initTheme } = await import('../src/modules/theme-manager.js');
    const { initDropZone } = await import('../src/components/file-drop-zone.js');
    const { initFileList } = await import('../src/components/file-list.js');
    const { initTagForm } = await import('../src/components/tag-form.js');
    const { initTechInfo } = await import('../src/components/tech-info.js');
    const { initConversionPanel } = await import('../src/components/conversion-panel.js');
    const { initProgressPanel } = await import('../src/components/progress-panel.js');
    const { initConfirmDialog } = await import('../src/components/confirmation-dialog.js');
    const { initBatchPanel } = await import('../src/components/batch-panel.js');
    const { initArtworkEditor } = await import('../src/components/artwork-editor.js');

    expect(() => {
      initTheme(document.getElementById('theme-toggle'));
      initConfirmDialog();
      initDropZone();
      initFileList();
      initTagForm();
      initArtworkEditor();
      initTechInfo();
      initConversionPanel();
      initProgressPanel();
      initBatchPanel();
    }).not.toThrow();

    // every referenced element id must exist
    const { emit } = await import('../src/modules/app-state.js');
    expect(() => emit('files-changed')).not.toThrow();
    expect(() => emit('active-changed', null)).not.toThrow();
  });
});
