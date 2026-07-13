/**
 * Wires the drop zone + file input to the file manager.
 */
import { addFiles } from '../modules/file-manager.js';

export function initDropZone() {
  const zone = document.getElementById('drop-zone');
  const input = document.getElementById('file-input');
  const browse = document.getElementById('browse-btn');

  browse.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files?.length) addFiles(input.files);
    input.value = '';
  });

  let depth = 0;
  const over = (ev) => {
    ev.preventDefault();
    zone.classList.add('is-dragover');
  };
  zone.addEventListener('dragenter', (ev) => { depth += 1; over(ev); });
  zone.addEventListener('dragover', over);
  zone.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove('is-dragover');
  });
  zone.addEventListener('drop', (ev) => {
    ev.preventDefault();
    depth = 0;
    zone.classList.remove('is-dragover');
    const files = [...(ev.dataTransfer?.files ?? [])];
    if (files.length) addFiles(files);
  });

  // whole-window drop should not navigate away
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('drop', (ev) => ev.preventDefault());
}
