/**
 * Header workflow step indicator: 1 Import → 2 Library → 3 Edit.
 * Highlights the furthest reached stage based on app state.
 */
import { state, on, getOrderedFiles } from '../modules/app-state.js';

export function initStepIndicator() {
  const steps = [...document.querySelectorAll('#app-steps .app-step')];
  if (steps.length === 0) return;

  function update() {
    const current = state.activeId ? 3 : getOrderedFiles().length > 0 ? 2 : 1;
    for (const el of steps) {
      el.classList.toggle('is-current', Number(el.dataset.step) === current);
    }
  }

  on('files-changed', update);
  on('active-changed', update);
  update();
}
