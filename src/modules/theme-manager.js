/**
 * Light/dark theme with system preference default and localStorage persistence.
 */
const KEY = 'aurela-theme';

function systemPrefersDark() {
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

function stored() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** Apply theme: 'light' | 'dark'. */
function apply(theme) {
  document.documentElement.dataset.theme = theme;
}

/** Initialize on startup and wire the toggle button. @param {HTMLElement} toggleBtn */
export function initTheme(toggleBtn) {
  const saved = stored();
  apply(saved ?? (systemPrefersDark() ? 'dark' : 'light'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!stored()) apply(e.matches ? 'dark' : 'light');
  });
  toggleBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  });
}
