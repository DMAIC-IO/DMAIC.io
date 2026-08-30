/**
 * HTML escaping helpers for the static handbook generator.
 * All user-facing text from the source files passes through here.
 */

const NAMED = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (ch) => NAMED[ch]);
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

/**
 * Reduce `{{term:id|label}}` / `{{term:id}}` to its visible text.
 *
 * For plain-text slots that cannot carry a link — <title>, meta description,
 * og:description, JSON-LD. Without this the raw token is what search engines
 * index. Mirrors stripTermTokens() in js/core/markdown-parser.js.
 *
 * @param {string} value
 * @returns {string}
 */
export function stripTermTokens(value) {
  if (value == null) return '';
  return String(value).replace(
    /\{\{term:([a-z0-9-]+)(?:\|([^}]+))?\}\}/gi,
    (_m, id, label) => label || id,
  );
}

/**
 * Pick the localized variant of a { de, en } object, with fallback.
 */
export function pick(obj, lang) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  if (obj[lang] != null) return obj[lang];
  if (obj.en != null) return obj.en;
  if (obj.de != null) return obj.de;
  return '';
}
