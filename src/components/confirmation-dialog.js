/**
 * Promise-based confirmation using the native <dialog>.
 */
let resolveFn = null;

export function initConfirmDialog() {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-ok').addEventListener('click', () => {
    resolveFn?.(true);
    resolveFn = null;
    dialog.close();
  });
  document.getElementById('confirm-cancel').addEventListener('click', () => {
    resolveFn?.(false);
    resolveFn = null;
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    resolveFn?.(false);
    resolveFn = null;
  });
}

/**
 * @param {string} title @param {string} message @param {string} [okLabel]
 * @returns {Promise<boolean>}
 */
export function confirmDialog(title, message, okLabel = 'OK') {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-ok').textContent = okLabel;
  dialog.showModal();
  return new Promise((resolve) => { resolveFn = resolve; });
}
