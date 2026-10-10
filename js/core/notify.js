import { icon } from './icon.js';

/** Lifetime of a plain toast and of one carrying an action button. */
const TOAST_MS = 4000;
const ACTION_TOAST_MS = 10000;

/**
 * D.Mike — Toast notification helper.
 * Appends a transient toast to #toast-container; auto-removes after 4 s, or
 * after 10 s when it carries an action button.
 *
 * @param {string} message - Text to display (plain — never glue a glyph onto
 *   this string; use `iconName` instead so the icon stays a real element and
 *   the toast text stays pure typography).
 * @param {'info'|'success'|'warning'|'error'} [type='info'] - Toast style.
 * @param {string|null} [iconName=null] - Semantic icon name (e.g. 'status.ok')
 *   rendered before the message. Omit for a text-only toast — existing callers
 *   that pass no icon keep working exactly as before.
 * @param {{ action?: { label: string, onClick: () => void } }} [options] -
 *   `action` renders a button after the message; a click removes the toast
 *   and calls `onClick`.
 */
export function notify(message, type = 'info', iconName = null, { action } = {}) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  if (iconName) toast.append(icon(iconName, { size: 'sm' }));
  toast.append(document.createTextNode(message));
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast__action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      toast.remove();
      action.onClick();
    });
    toast.append(button);
  }
  container.append(toast);
  setTimeout(() => toast.remove(), action ? ACTION_TOAST_MS : TOAST_MS);
}
