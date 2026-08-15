/**
 * D.Mike — Action modal (ui/action-modal.js)
 * Non-dismissible progress dialog shown while an action verb runs (e.g.
 * loading a scenario). Replaces the former full-screen action splash: same
 * lifecycle (open/update/close), but rendered through the shared modal so it
 * looks like every other dialog in the app.
 *
 * Instance contract: createActionModal() holds NO module-level state — every
 * call returns an independent controller. The app creates exactly ONE (app.js)
 * and passes it as `ui.actionModal` into both buildFrame() and initRouter(),
 * so the router and the help-panel entry point drive the same dialog.
 *
 * Not dismissible on purpose: aborting halfway through would leave a
 * half-built project behind. There is no ✕, no Escape, no overlay click.
 */

import { h } from '../core/dom.js';

/**
 * Row markers. Purely typographic (no words) — the meaning is carried by the
 * translated `aria-label` on the same element and by the row's colour.
 */
const STATUS_GLYPH = { pending: '·', ok: '✓', failed: '✕' };

/**
 * @param {{ i18n: object, modal: object }} deps
 * @returns {{ open: (o: {title: string, subtitle?: string, body?: Node}) => void,
 *             update: (text: string) => void,
 *             addItem: (o: {id: string|number, label: string}) => void,
 *             markItem: (id: string|number, ok: boolean) => void,
 *             hold: (o: {title: string, subtitle?: string, body?: Node,
 *                        confirmLabel?: string}) => Promise<boolean>,
 *             close: () => void, isOpen: () => boolean }}
 */
export function createActionModal({ i18n, modal }) {
  let handle = null;      // { close, modal } from Modal.show()
  let root = null;        // .action-modal
  let subtitleEl = null;
  let progressEl = null;
  let bodyEl = null;
  let listEl = null;
  let spinnerEl = null;
  let footerEl = null;
  /** id → row element, so a row can be marked long after it was added. */
  let rowsById = new Map();
  /** Resolver of a pending hold(), if the dialog currently waits for a confirm. */
  let releaseHold = null;

  function build() {
    spinnerEl = h('div', { class: 'app-loading__spinner' });
    subtitleEl = h('div', { class: 'action-modal__subtitle' });
    progressEl = h('div', { class: 'action-modal__progress' });
    bodyEl = h('div', { class: 'action-modal__body' });
    listEl = h('ul', { class: 'action-modal__list' });
    footerEl = h('div', { class: 'action-modal__footer' });
    root = h('div', {
      class: 'action-modal', role: 'status', 'aria-live': 'polite',
      'aria-label': i18n.t('actions.modalLabel'),
    }, spinnerEl, subtitleEl, progressEl, listEl, bodyEl, footerEl);
    return root;
  }

  /** Drop every row of a previous run. @returns {void} */
  function clearList() {
    rowsById = new Map();
    listEl?.replaceChildren();
  }

  function setTitle(title) {
    handle?.modal?.querySelector('.modal__title')?.replaceChildren(document.createTextNode(title));
  }

  function fill({ title, subtitle = '', body = null }) {
    setTitle(title);
    subtitleEl.textContent = subtitle;
    bodyEl.replaceChildren();
    if (body) bodyEl.append(body);
  }

  /**
   * Settle a pending hold(), if any. `true` = the user confirmed, `false` =
   * the dialog was closed or re-purposed by someone else. Cleared first so a
   * re-entrant close() cannot resolve it twice.
   * @param {boolean} confirmed
   * @returns {void}
   */
  function settleHold(confirmed) {
    const release = releaseHold;
    releaseHold = null;
    release?.(confirmed);
  }

  const api = {
    open({ title, subtitle = '', body = null }) {
      // Re-purposing a holding dialog cancels the hold: its button is about to
      // be replaced, so nobody will ever confirm it.
      settleHold(false);
      if (handle) {
        fill({ title, subtitle, body });
        progressEl.textContent = '';
        clearList();
        return;
      }
      const node = build();
      handle = modal.show(title, node, {
        dismissible: false, overlayClass: 'modal-overlay--action',
      });
      progressEl.textContent = '';
      fill({ title, subtitle, body });
    },

    update(text) { if (progressEl) progressEl.textContent = text; },

    /**
     * Append one item to the running list — newest FIRST, so what just
     * happened is readable without waiting and without auto-scrolling. The row
     * starts out pending; markItem() settles it once the item reports back.
     * No-op while no dialog is open.
     * @param {{id: string|number, label: string}} item
     * @returns {void}
     */
    addItem({ id, label }) {
      if (!listEl || rowsById.has(id)) return;
      const status = h('span', {
        class: 'action-modal__item-status', 'aria-label': i18n.t('actions.itemPending'),
      }, STATUS_GLYPH.pending);
      const row = h('li', { class: 'action-modal__item action-modal__item--pending' },
        status, h('span', { class: 'action-modal__item-label' }, label));
      rowsById.set(id, row);
      listEl.prepend(row);
    },

    /**
     * Retroactively settle the row added for `id`. The loader announces an
     * item before it knows the outcome, so the row is marked here — never with
     * the raw `failed[].error`, which is untranslated developer text.
     * Unknown ids are ignored (an item-done without a row is harmless).
     * @param {string|number} id  @param {boolean} ok  @returns {void}
     */
    markItem(id, ok) {
      const row = rowsById.get(id);
      if (!row) return;
      row.classList.remove('action-modal__item--pending');
      row.classList.add(ok ? 'action-modal__item--ok' : 'action-modal__item--failed');
      const status = row.querySelector('.action-modal__item-status');
      if (status) {
        status.textContent = ok ? STATUS_GLYPH.ok : STATUS_GLYPH.failed;
        status.setAttribute('aria-label', i18n.t(ok ? 'actions.itemLoaded' : 'actions.itemFailed'));
      }
    },

    async hold({ title, subtitle = '', body = null, confirmLabel }) {
      if (!handle) return false;
      spinnerEl.remove();
      fill({ title, subtitle, body });
      progressEl.textContent = '';
      const confirmed = await new Promise((resolve) => {
        releaseHold = resolve;
        const btn = h('button', { class: 'btn btn--primary action-modal__confirm' },
          confirmLabel || i18n.t('actions.startNow'));
        btn.addEventListener('click', () => { releaseHold = null; resolve(true); });
        footerEl.replaceChildren(btn);
        btn.focus();
      });
      // Only the confirm path closes: on a forced close the dialog is already
      // gone, and on a re-open closing here would kill the NEW dialog.
      if (confirmed) api.close();
      return confirmed;
    },

    /**
     * Close the dialog. Settles a pending hold() with `false` — whoever closes
     * the dialog from outside (the router's `finally`, an error path) must not
     * strand an awaiting caller on a promise whose button no longer exists,
     * and must not be mistaken for the user's confirmation. Idempotent.
     *
     * Routing obligation: force-closing a PENDING hold() makes you responsible
     * for navigating away from the `#/action/…` hash yourself. The router
     * deliberately skips its own navigation in that case (it would fight you
     * for the route), and the app must never be left on a dead action hash.
     * @returns {void}
     */
    close() {
      handle?.close();
      handle = null; root = null; subtitleEl = null; progressEl = null;
      bodyEl = null; listEl = null; spinnerEl = null; footerEl = null;
      rowsById = new Map();
      settleHold(false);   // after teardown: the awaiting caller sees a closed dialog
    },

    isOpen() { return handle !== null; },
  };

  return api;
}
