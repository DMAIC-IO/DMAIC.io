/**
 * D.Mike — Read-only lock (core/readonly-lock.js)
 *
 * The UI half of read-only mode. A completed project's writes are already
 * dropped by the StateManager; this lock makes the controls in the module area
 * say so, instead of accepting input that silently vanishes (Bug 023).
 *
 * Locking disables form controls and buttons, turns off contenteditable and
 * HTML5 drag, and keeps doing so for content rendered later. View and export
 * controls stay usable. Unlocking restores only what the lock changed.
 */

/** Controls that only view or export and therefore stay usable when locked. */
export const READONLY_ALLOWED = [
  '[role="tab"]',
  '[aria-expanded]',
  '[data-export]',
  '[data-action^="export"]',
  '[data-action="copy"]',
  '.dmike-chart-modebar-btn',
  '.dmike-chart-dropdown-item',
  '[data-readonly-allow]',
].join(', ');

const CONTROLS = 'input, select, textarea, button';
const LOCKED_DISABLED = 'data-readonly-disabled';
const LOCKED_EDITABLE = 'data-readonly-editable';
const LOCKED_DRAGGABLE = 'data-readonly-draggable';

/** @type {WeakMap<Element, MutationObserver>} */
const observers = new WeakMap();

/**
 * True when `el` sits inside a read-only project (`body.dmike--readonly`).
 * For components that handle input outside the locked module area.
 *
 * @param {Element|null|undefined} el
 * @returns {boolean}
 */
export function isReadOnly(el) {
  return Boolean(el?.closest?.('.dmike--readonly'));
}

/**
 * Lock or unlock every editing control under `root`.
 *
 * @param {Element|null} root - Container to lock (the workspace module area).
 * @param {boolean} locked
 */
export function setReadonlyLock(root, locked) {
  if (!root) return;
  if (locked) {
    lockTree(root);
    if (!observers.has(root)) {
      const observer = new MutationObserver(() => lockTree(root));
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'contenteditable', 'draggable'],
      });
      observers.set(root, observer);
    }
  } else {
    observers.get(root)?.disconnect();
    observers.delete(root);
    unlockTree(root);
  }
}

/** @param {Element} root */
function lockTree(root) {
  for (const el of root.querySelectorAll(CONTROLS)) {
    if (el.disabled || el.matches(READONLY_ALLOWED)) continue;
    el.disabled = true;
    el.setAttribute(LOCKED_DISABLED, '');
  }
  for (const el of root.querySelectorAll('[contenteditable]')) {
    const value = el.getAttribute('contenteditable');
    if (value === 'false') continue;
    el.setAttribute(LOCKED_EDITABLE, value);
    el.setAttribute('contenteditable', 'false');
  }
  for (const el of root.querySelectorAll('[draggable="true"]')) {
    el.setAttribute(LOCKED_DRAGGABLE, '');
    el.setAttribute('draggable', 'false');
  }
}

/** @param {Element} root */
function unlockTree(root) {
  for (const el of root.querySelectorAll(`[${LOCKED_DISABLED}]`)) {
    el.disabled = false;
    el.removeAttribute(LOCKED_DISABLED);
  }
  for (const el of root.querySelectorAll(`[${LOCKED_EDITABLE}]`)) {
    el.setAttribute('contenteditable', el.getAttribute(LOCKED_EDITABLE));
    el.removeAttribute(LOCKED_EDITABLE);
  }
  for (const el of root.querySelectorAll(`[${LOCKED_DRAGGABLE}]`)) {
    el.setAttribute('draggable', 'true');
    el.removeAttribute(LOCKED_DRAGGABLE);
  }
}
