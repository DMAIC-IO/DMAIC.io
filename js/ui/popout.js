/**
 * Generic popout helpers built on the dmike-chart-popout CSS shell.
 *
 * Use these instead of modal.js for new dialogs. Popouts are draggable,
 * close on overlay-click / X-button / Escape, and reuse the chart popout
 * styling (defined in js/core/chart/chart.css).
 *
 * Compact dialogs (confirm, alert) override min-height: 280px and disable
 * resize via the `--compact` modifier.
 */

import { icon } from '../core/icon.js';

/**
 * Show a confirmation dialog as a dmike-chart-popout.
 * Returns true if the user confirms, false otherwise (cancel / close / escape).
 *
 * @param {string} message - Body text shown to the user.
 * @param {object} options
 * @param {object} options.i18n - I18n instance (required, for default labels).
 * @param {string} [options.title] - Title bar text. Default: t('common.confirm').
 * @param {string} [options.confirmLabel] - Default: t('common.yes').
 * @param {string} [options.cancelLabel] - Default: t('common.cancel').
 * @param {boolean} [options.danger] - Apply btn--danger styling to confirm.
 * @returns {Promise<boolean>}
 */
export function confirmPopout(message, options = {}) {
  const i18n = options.i18n;
  if (!i18n) throw new Error('confirmPopout: options.i18n is required');
  const title = options.title ?? i18n.t('common.confirm');
  const confirmLabel = options.confirmLabel ?? i18n.t('common.yes');
  const cancelLabel = options.cancelLabel ?? i18n.t('common.cancel');

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dmike-chart-popout-overlay';

    const win = document.createElement('div');
    win.className = 'dmike-chart-popout dmike-chart-popout--compact';
    win.style.width = '380px';
    win.style.height = 'auto';
    win.style.maxHeight = '80vh';
    win.style.left = 'calc(50% - 190px)';
    win.style.top = '120px';

    const titleBar = document.createElement('div');
    titleBar.className = 'dmike-chart-popout-titlebar';
    const titleText = document.createElement('span');
    titleText.textContent = title;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dmike-chart-popout-close';
    closeBtn.replaceChildren(icon('action.close', { size: 'sm' }));
    titleBar.append(titleText, closeBtn);

    const body = document.createElement('div');
    body.className = 'dmike-chart-popout-body dmike-popout-body--column';

    const messageArea = document.createElement('div');
    messageArea.className = 'dmike-popout-message';
    messageArea.textContent = message;

    const footer = document.createElement('div');
    footer.className = 'dmike-popout-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn--secondary';
    cancelBtn.textContent = cancelLabel;
    const confirmBtn = document.createElement('button');
    confirmBtn.className = options.danger ? 'btn btn--danger' : 'btn btn--primary';
    confirmBtn.textContent = confirmLabel;
    footer.append(cancelBtn, confirmBtn);

    body.append(messageArea, footer);
    win.append(titleBar, body);
    overlay.appendChild(win);
    document.body.appendChild(overlay);

    let dragX = 0, dragY = 0, isDragging = false;
    const onDragStart = (e) => {
      if (closeBtn.contains(e.target)) return;
      isDragging = true;
      dragX = e.clientX - win.offsetLeft;
      dragY = e.clientY - win.offsetTop;
      win.style.transition = 'none';
    };
    const onDragMove = (e) => {
      if (!isDragging) return;
      win.style.left = `${e.clientX - dragX  }px`;
      win.style.top = `${e.clientY - dragY  }px`;
    };
    const onDragEnd = () => { isDragging = false; win.style.transition = ''; };
    titleBar.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    const close = (result) => {
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(result);
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKeyDown);
    closeBtn.addEventListener('click', () => close(false));
    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

    confirmBtn.focus();
  });
}
