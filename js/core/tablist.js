/**
 * D.Mike — Tablist keyboard navigation (`x-tablist`).
 *
 * Moves focus between the `role="tab"` descendants of a `role="tablist"`
 * element: ArrowLeft/ArrowRight (wrapping), Home and End. Activation stays
 * manual and native — Enter/Space click the focused tab button, so the
 * module's own `@click` handler remains the only place that switches tabs.
 * Roving `tabindex` and `aria-selected` are bound in the templates.
 */

const KEYS = new Set(['ArrowRight', 'ArrowLeft', 'Home', 'End']);
const EDITABLE = 'input, textarea, select, [contenteditable]';
const registered = new WeakSet();

/** @param {HTMLElement} tab */
function isVisible(tab) {
  return typeof tab.checkVisibility === 'function'
    ? tab.checkVisibility()
    : tab.offsetParent !== null;
}

/**
 * Handle one keydown on a tablist: focus the next/previous/first/last
 * enabled, visible tab. Does nothing unless focus is on one of its tabs.
 * @param {HTMLElement} tablist - the `role="tablist"` element
 * @param {KeyboardEvent} event
 * @returns {boolean} true when focus moved (the event is then defaultPrevented)
 */
export function moveTabFocus(tablist, event) {
  if (!KEYS.has(event.key)) return false;
  if (event.target instanceof Element && event.target.closest(EDITABLE)) return false;
  const tabs = [...tablist.querySelectorAll('[role="tab"]')]
    .filter(tab => !tab.disabled && isVisible(tab));
  const current = tabs.indexOf(document.activeElement);
  if (current === -1) return false;

  const last = tabs.length - 1;
  let next;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = last;
  else if (event.key === 'ArrowRight') next = current === last ? 0 : current + 1;
  else next = current === 0 ? last : current - 1;

  event.preventDefault();
  tabs[next].focus();
  return true;
}

/**
 * Register the `x-tablist` directive. Call BEFORE Alpine.start().
 * Idempotent per Alpine instance.
 * @param {object} Alpine - the csp.js default export
 */
export function registerTablistDirective(Alpine) {
  if (registered.has(Alpine)) return;
  registered.add(Alpine);
  Alpine.directive('tablist', (el, _directive, { cleanup }) => {
    const onKeydown = (event) => moveTabFocus(el, event);
    el.addEventListener('keydown', onKeydown);
    cleanup(() => el.removeEventListener('keydown', onKeydown));
  });
}
