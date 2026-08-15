/**
 * D.Mike — Modal / Dialog System (modal.js)
 * Shared modal dialogs: alert + form + custom content.
 *
 * NOTE: For confirm dialogs use `context.confirmPopout(...)` (defined in
 * js/ui/popout.js) — it builds on the dmike-chart-popout shell instead of
 * this modal system. The legacy `confirm()` method here was removed in
 * favor of the popout helper.
 */

import { h } from '../core/dom.js';

export class Modal {
  /**
   * @param {import('../core/i18n.js').I18n} i18n
   */
  constructor(i18n) {
    this._i18n = i18n;
    this._stack = [];
  }

  /**
   * Show an alert dialog (OK only).
   * @param {string} message
   * @param {string} [title]
   * @returns {Promise<void>}
   */
  alert(message, title) {
    return new Promise((resolve) => {
      const { overlay, modal } = this._create(title ?? this._i18n.t('common.ok'), h('p', null, message));
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
   * @param {HTMLElement} content - form body node (e.g. a module's x-ref Alpine form)
   * @param {object} [options]
   * @param {string} [options.confirmLabel]
   * @param {string} [options.cancelLabel]
   * @param {string} [options.deleteLabel] - label for the optional delete button
   * @param {boolean} [options.hideConfirm=false] - omit the confirm button (self-driving
   *   content confirms via the `onMount` api instead); cancel stays available
   * @param {function} [options.onMount] - called with (body, api) after rendering, where
   *   api = { confirm(): void, cancel(): void } lets embedded content confirm/cancel itself
   * @param {function} [options.onConfirm] - called with body element; return false to prevent close
   * @param {function} [options.onDelete] - when provided, renders a destructive
   *   delete button (left-aligned). Called with body element; return false to
   *   prevent close, otherwise the dialog closes and resolves with 'deleted'.
   * @returns {Promise<boolean|'deleted'>} true if confirmed, 'deleted' if deleted, false otherwise
   */
  form(title, content, options = {}) {
    return new Promise((resolve) => {
      const confirmLabel = options.confirmLabel ?? this._i18n.t('common.save');
      const cancelLabel = options.cancelLabel ?? this._i18n.t('common.cancel');

      const { overlay, body, footer } = this._create(title, content);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn--secondary';
      cancelBtn.textContent = cancelLabel;

      const confirmBtn = document.createElement('button');
      // modal__confirm is a stable hook for E2E/POMs (btn--primary alone is
      // shared by many unrelated buttons across the app).
      confirmBtn.className = 'btn btn--primary modal__confirm';
      confirmBtn.textContent = confirmLabel;

      // Guards against a late confirm()/cancel() firing after the dialog has
      // already resolved (e.g. a caller holding on to `api` past close, or a
      // stray footer-button click racing a programmatic close): the promise
      // itself is settle-once by nature, but without this flag a second
      // `runConfirm()` would still re-run `onConfirm`'s side effects even
      // though `close()` would silently no-op.
      let settled = false;

      const close = (result) => {
        if (settled) return;
        settled = true;
        this._close(overlay);
        resolve(result);
      };

      const runConfirm = () => {
        if (settled) return;
        if (options.onConfirm && options.onConfirm(body) === false) return; // Veto
        close(true);
      };

      // Optional destructive action, left-aligned (see .modal__footer-delete).
      if (options.onDelete) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn--danger modal__footer-delete';
        deleteBtn.textContent = options.deleteLabel ?? this._i18n.t('common.delete');
        footer.append(deleteBtn);
        deleteBtn.addEventListener('click', () => {
          if (options.onDelete(body) === false) return; // prevent close
          close('deleted');
        });
      }

      footer.append(cancelBtn);
      if (!options.hideConfirm) {
        footer.append(confirmBtn);
        confirmBtn.addEventListener('click', runConfirm);
      }

      cancelBtn.addEventListener('click', () => close(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      this._onEscape(() => close(false));

      if (options.onMount) options.onMount(body, { confirm: runConfirm, cancel: () => close(false) });
    });
  }

  /**
   * Show a modal with custom HTML content.
   * @param {string} title
   * @param {HTMLElement} content
   * @param {object} [options]
   * @param {boolean} [options.wide=false]
   * @param {boolean} [options.dismissible=true] - false omits the header close (✕)
   *   button. show() never wires Escape or overlay-click handlers, so with
   *   dismissible:false the dialog is closable only via the returned `close()`
   *   handle — the caller must call it eventually or the overlay is stuck.
   * @param {string} [options.overlayClass] - extra class appended to `.modal-overlay`
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
    const { wide = false, dismissible = true, overlayClass = '' } = options;
    const overlay = document.createElement('div');
    overlay.className = `modal-overlay${overlayClass ? ` ${overlayClass}` : ''}`;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = 'modal';
    if (wide) modal.style.maxWidth = '800px';

    const header = document.createElement('div');
    header.className = 'modal__header';
    const title_el = h('span', { class: 'modal__title' }, title);
    header.append(title_el);
    if (dismissible) {
      const closeBtn = h('button', {
        class: 'btn btn--icon btn--ghost modal__close',
        'aria-label': this._i18n.t('common.close'),
      }, '✕');
      header.append(closeBtn);
      closeBtn.addEventListener('click', () => this._close(overlay));
    }

    const body = document.createElement('div');
    body.className = 'modal__body';
    // Content is always a DOM node. Borrow/restore: a template-owned node passed
    // as `content` is moved into the modal body and returned to its DOM home on
    // close (so Alpine bindings survive — Alpine's reactive scope is cached on
    // the element). Freshly-built nodes have no home and are discarded with the
    // overlay.
    let borrowed = null;
    if (content) {
      borrowed = content.parentNode ? { node: content, home: content.parentNode, next: content.nextSibling } : null;
      body.append(content);
    }
    overlay._borrowed = borrowed;

    const footer = document.createElement('div');
    footer.className = 'modal__footer';

    modal.append(header, body, footer);
    overlay.append(modal);
    document.body.append(overlay);
    this._stack.push(overlay);

    return { overlay, modal, body, footer };
  }

  _close(overlay) {
    // Restore a borrowed template node to its home BEFORE removing the overlay,
    // otherwise its removal would tear down the Alpine component.
    const b = overlay._borrowed;
    if (b && b.home) b.home.insertBefore(b.node, b.next);
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
