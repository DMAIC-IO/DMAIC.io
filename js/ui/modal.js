/**
 * D.Mike — Modal / Dialog System (modal.js)
 * Shared modal dialogs: confirm, alert, custom content.
 * Traps focus while open. Closes on Escape or overlay click.
 */

export class Modal {
  /**
   * @param {import('../core/i18n.js').I18n} i18n
   */
  constructor(i18n) {
    this._i18n = i18n;
    this._stack = [];
  }

  /**
   * Show a confirmation dialog.
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.title]
   * @param {string} [options.confirmLabel]
   * @param {string} [options.cancelLabel]
   * @param {boolean} [options.danger=false]
   * @returns {Promise<boolean>} true if confirmed
   */
  confirm(message, options = {}) {
    return new Promise((resolve) => {
      const title = options.title ?? this._i18n.t('common.confirm');
      const confirmLabel = options.confirmLabel ?? this._i18n.t('common.yes');
      const cancelLabel = options.cancelLabel ?? this._i18n.t('common.cancel');

      const { overlay, modal } = this._create(title, `<p>${message}</p>`);
      const footer = modal.querySelector('.modal__footer');

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn--secondary';
      cancelBtn.textContent = cancelLabel;

      const confirmBtn = document.createElement('button');
      confirmBtn.className = options.danger ? 'btn btn--danger' : 'btn btn--primary';
      confirmBtn.textContent = confirmLabel;

      footer.append(cancelBtn, confirmBtn);

      const close = (result) => {
        this._close(overlay);
        resolve(result);
      };

      cancelBtn.addEventListener('click', () => close(false));
      confirmBtn.addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      this._onEscape(() => close(false));

      confirmBtn.focus();
    });
  }

  /**
   * Show an alert dialog (OK only).
   * @param {string} message
   * @param {string} [title]
   * @returns {Promise<void>}
   */
  alert(message, title) {
    return new Promise((resolve) => {
      const { overlay, modal } = this._create(title ?? this._i18n.t('common.ok'), `<p>${message}</p>`);
      const footer = modal.querySelector('.modal__footer');

      const okBtn = document.createElement('button');
      okBtn.className = 'btn btn--primary';
      okBtn.textContent = this._i18n.t('common.ok');
      footer.append(okBtn);

      const close = () => { this._close(overlay); resolve(); };
      okBtn.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      this._onEscape(close);
      okBtn.focus();
    });
  }

  /**
   * Show a form dialog with confirm/cancel buttons.
   * @param {string} title
   * @param {string|HTMLElement} content - form HTML
   * @param {object} [options]
   * @param {string} [options.confirmLabel]
   * @param {string} [options.cancelLabel]
   * @param {function} [options.onMount] - called with body element after rendering
   * @param {function} [options.onConfirm] - called with body element; return false to prevent close
   * @returns {Promise<boolean>} true if confirmed
   */
  form(title, content, options = {}) {
    return new Promise((resolve) => {
      const confirmLabel = options.confirmLabel ?? this._i18n.t('common.save');
      const cancelLabel = options.cancelLabel ?? this._i18n.t('common.cancel');

      const { overlay, modal, body, footer } = this._create(title, content);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn--secondary';
      cancelBtn.textContent = cancelLabel;

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn--primary';
      confirmBtn.textContent = confirmLabel;

      footer.append(cancelBtn, confirmBtn);

      const close = (result) => {
        this._close(overlay);
        resolve(result);
      };

      cancelBtn.addEventListener('click', () => close(false));
      confirmBtn.addEventListener('click', () => {
        if (options.onConfirm) {
          const result = options.onConfirm(body);
          if (result === false) return; // prevent close
        }
        close(true);
      });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      this._onEscape(() => close(false));

      if (options.onMount) options.onMount(body);
    });
  }

  /**
   * Show a modal with custom HTML content.
   * @param {string} title
   * @param {string|HTMLElement} content
   * @param {object} [options]
   * @param {boolean} [options.wide=false]
   * @returns {{ close: function }} handle to close programmatically
   */
  show(title, content, options = {}) {
    const { overlay, modal } = this._create(title, content, options);
    return {
      close: () => this._close(overlay),
      modal,
    };
  }

  // ─── Internal ───────────────────────────────────────────────

  _create(title, content, options = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = 'modal';
    if (options.wide) modal.style.maxWidth = '800px';

    const header = document.createElement('div');
    header.className = 'modal__header';
    header.innerHTML = `
      <span class="modal__title">${title}</span>
      <button class="btn btn--icon btn--ghost modal__close" aria-label="${this._i18n.t('common.close')}">✕</button>
    `;

    const body = document.createElement('div');
    body.className = 'modal__body';
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else {
      body.append(content);
    }

    const footer = document.createElement('div');
    footer.className = 'modal__footer';

    modal.append(header, body, footer);
    overlay.append(modal);
    document.body.append(overlay);
    this._stack.push(overlay);

    header.querySelector('.modal__close').addEventListener('click', () => this._close(overlay));

    return { overlay, modal, body, footer };
  }

  _close(overlay) {
    overlay.remove();
    this._stack = this._stack.filter(o => o !== overlay);
  }

  _onEscape(callback) {
    const handler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handler);
        callback();
      }
    };
    document.addEventListener('keydown', handler);
  }
}
