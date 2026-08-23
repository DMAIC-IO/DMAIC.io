import { icon } from './icon.js';

/**
 * D.Mike — Toast notification helper.
 * Appends a transient toast to #toast-container; auto-removes after 4 s.
 *
 * @param {string} message - Text to display (plain — never glue a glyph onto
 *   this string; use `iconName` instead so the icon stays a real element and
 *   the toast text stays pure typography).
 * @param {'info'|'success'|'warning'|'error'} [type='info'] - Toast style.
 * @param {string|null} [iconName=null] - Semantic icon name (e.g. 'status.ok')
 *   rendered before the message. Omit for a text-only toast — existing callers
 *   that pass no icon keep working exactly as before.
 */
export function notify(message, type = 'info', iconName = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  if (iconName) toast.append(icon(iconName, { size: 'sm' }));
  toast.append(document.createTextNode(message));
  container.append(toast);
  setTimeout(() => toast.remove(), 4000);
}
