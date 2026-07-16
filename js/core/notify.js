/**
 * D.Mike — Toast notification helper.
 * Appends a transient toast to #toast-container; auto-removes after 4 s.
 *
 * @param {string} message - Text to display.
 * @param {'info'|'success'|'warning'|'error'} [type='info'] - Toast style.
 */
export function notify(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.append(toast);
  setTimeout(() => toast.remove(), 4000);
}
