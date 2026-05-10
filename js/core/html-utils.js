/**
 * D.Mike — HTML Escaping Utilities (html-utils.js)
 * Shared helpers for safe HTML/attribute string escaping.
 */

// Lazy-init so the module imports cleanly in Node-side test runners that
// only need other exports from files that transitively pull this in.
let _d;

/** @param {*} s  @returns {string} */
export function esc(s) {
  if (!_d) _d = document.createElement('div');
  _d.textContent = s ?? '';
  return _d.innerHTML;
}

export { esc as escHtml };

/** @param {*} s  @returns {string} */
export function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
