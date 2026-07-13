/**
 * Editor form tabs (Basic / Details / Publishing) with roving-tabindex keyboard support.
 */
export function initEditorTabs() {
  const tablist = document.querySelector('.editor-tabs');
  if (!tablist) return;
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));

  function select(tab, focus = false) {
    tabs.forEach((t, i) => {
      const active = t === tab;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
      panels[i].hidden = !active;
    });
    if (focus) tab.focus();
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => select(tab)));
  tablist.addEventListener('keydown', (ev) => {
    const i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    if (ev.key === 'ArrowRight') select(tabs[(i + 1) % tabs.length], true);
    else if (ev.key === 'ArrowLeft') select(tabs[(i - 1 + tabs.length) % tabs.length], true);
    else if (ev.key === 'Home') select(tabs[0], true);
    else if (ev.key === 'End') select(tabs[tabs.length - 1], true);
    else return;
    ev.preventDefault();
  });
}
