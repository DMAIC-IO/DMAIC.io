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
 * @param {{ i18n: object, modal: object }} deps
 * @returns {{ open: (o: {title: string, subtitle?: string, body?: Node}) => void,
 *             update: (text: string) => void,
 *             hold: (o: {title: string, subtitle?: string, body?: Node,
 *                        confirmLabel?: string}) => Promise<void>,
 *             close: () => void, isOpen: () => boolean }}
 */
export function createActionModal({ i18n, modal }) {
  let handle = null;      // { close, modal } from Modal.show()
  let root = null;        // .action-modal
  let subtitleEl = null;
  let progressEl = null;
  let bodyEl = null;
  let spinnerEl = null;
  let footerEl = null;

  function build() {
    spinnerEl = h('div', { class: 'app-loading__spinner' });
    subtitleEl = h('div', { class: 'action-modal__subtitle' });
    progressEl = h('div', { class: 'action-modal__progress' });
    bodyEl = h('div', { class: 'action-modal__body' });
    footerEl = h('div', { class: 'action-modal__footer' });
    root = h('div', {
      class: 'action-modal', role: 'status', 'aria-live': 'polite',
      'aria-label': i18n.t('actions.modalLabel'),
    }, spinnerEl, subtitleEl, progressEl, bodyEl, footerEl);
    return root;
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

  return {
    open({ title, subtitle = '', body = null }) {
      if (handle) { fill({ title, subtitle, body }); progressEl.textContent = ''; return; }
      const node = build();
      handle = modal.show(title, node, {
        dismissible: false, overlayClass: 'modal-overlay--action',
      });
      progressEl.textContent = '';
      fill({ title, subtitle, body });
    },

    update(text) { if (progressEl) progressEl.textContent = text; },

    async hold({ title, subtitle = '', body = null, confirmLabel }) {
      if (!handle) return;
      spinnerEl.remove();
      fill({ title, subtitle, body });
      progressEl.textContent = '';
      await new Promise((resolve) => {
        const btn = h('button', { class: 'btn btn--primary action-modal__confirm' },
          confirmLabel || i18n.t('actions.startNow'));
        btn.addEventListener('click', () => resolve());
        footerEl.replaceChildren(btn);
        btn.focus();
      });
      this.close();
    },

    close() {
      handle?.close();
      handle = null; root = null; subtitleEl = null; progressEl = null;
      bodyEl = null; spinnerEl = null; footerEl = null;
    },

    isOpen() { return handle !== null; },
  };
}
