/**
 * Shows the conversion queue with progress bars and cancel buttons.
 */
import { onQueueChange } from '../modules/conversion-service.js';
import { h } from '../modules/utils.js';

export function initProgressPanel() {
  const section = document.getElementById('progress-section');
  const list = document.getElementById('progress-list');

  onQueueChange((jobs) => {
    section.hidden = jobs.length === 0;
    list.replaceChildren(...jobs.map((job) => {
      const li = h('li', { class: 'progress-item' });
      li.append(h('span', { class: 'progress-item__label' }, job.label));
      if (['queued', 'running', 'loading engine'].includes(job.status) || job.status.startsWith('downloading')) {
        const cancel = h('button', { class: 'btn btn--danger-ghost', type: 'button' }, 'Cancel');
        cancel.addEventListener('click', () => job.cancel());
        li.append(cancel);
      } else {
        li.append(h('span', {}, ''));
      }
      const bar = h('progress', { max: '1' });
      bar.value = job.progress;
      li.append(bar);
      li.append(h('span', { class: 'progress-item__status' }, job.status));
      return li;
    }));
  });
}
