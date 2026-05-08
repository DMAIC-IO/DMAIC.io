/**
 * D.Mike — HTML Escaping Utilities (html-utils.js)
 * Shared helpers for safe HTML/attribute string escaping.
 */

const _d = document.createElement('div');

/** @param {*} s  @returns {string} */
export function esc(s) {
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
