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
