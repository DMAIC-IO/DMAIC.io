/**
 * D.Mike — Dialog service (ui/dialog/dialog.js)
 * The one place shell and modules open dialogs: confirm, alert, form, show
 * and the non-dismissible progress dialog. Every dialog is a clone of
 * dialog.html in the draggable popout look, bound to one reactive `dlg`
 * object. The newest dialog is on top; Escape closes only that one.
 *
 * Exposed to modules as `context.dialog`, to shell code as `dialog`.
 * The service owns i18n; callers pass already translated text.
 */

import Alpine from '@alpinejs/csp';
import { cloneTemplate, stripBlankText } from '../../core/dom.js';
import { draggablePopout } from '../draggable-popout.js';
import { buildDialogState } from './dialog-state.js';
import { createProgress, STATUS_ICON, STATUS_LABEL } from './progress.js';


/** Inlined template key of the shell. */
export const DIALOG_TEMPLATE = 'js/ui/dialog/dialog.html';

/**
 * @param {{ i18n: { t: (key: string, params?: object) => string } }} deps
 * @returns {{ confirm: Function, alert: Function, form: Function, show: Function, progress: Function }}
 */
export function createDialogService({ i18n }) {
  const t = (key, params) => i18n.t(key, params);
  /** Open dialogs, oldest first — the last one is on top. */
  const stack = [];

  /**
   * One capture-phase listener while any dialog is open. Capture on window
   * runs before every `@keydown.escape.window` handler of a module popout,
   * and stopImmediatePropagation keeps the Escape from closing that popout
   * too. A non-dismissible top dialog swallows the Escape as well: it is
   * modal, nothing behind it may react.
   * @param {KeyboardEvent} e
   */
  function onKeydown(e) {
    if (e.key !== 'Escape' || e.isComposing || stack.length === 0) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    stack[stack.length - 1].dlg.dismiss();
  }

  /**
   * Move a caller node into a slot. A node that already has a DOM home is
   * borrowed and returned on close (Alpine `$refs` forms, createDialog).
   * @param {HTMLElement} root  @param {string} name  @param {Node|null|undefined} node
   * @param {Array<{node: Node, home: Node, next: Node|null}>} borrowed
   */
  function place(root, name, node, borrowed) {
    if (!node) return;
    if (node.parentNode) borrowed.push({ node, home: node.parentNode, next: node.nextSibling });
    root.querySelector(`[data-dialog-slot="${name}"]`).append(node);
  }

  /** Put a borrowed node back; a vanished next sibling means "append". */
  function restore({ node, home, next }) {
    home.insertBefore(node, next && next.parentNode === home ? next : null);
  }

  /**
   * Clone the shell, bind state, open it on top of the stack.
   * @param {string} variant
   * @param {object} opts     caller options (see buildDialogState)
   * @param {{ body?: Node, footerStart?: Node }} slots
   * @param {{ confirm: Function, cancel: Function, remove?: Function, holdConfirm?: Function }} handlers
   * @returns {{ root: HTMLElement, dlg: object, borrowed: Array }}
   */
  function mount(variant, opts, slots, handlers) {
    const state = buildDialogState(variant, opts, t);
    const half = state.width / 2;
    const dlg = Alpine.reactive({
      ...state,
      ...draggablePopout({
        size: `width:${state.width}px;height:auto;max-height:80vh;`,
        initialPosition: `left:calc(50% - ${half}px);top:10vh`,
      }),
      progress: { spinner: true, subtitle: '', line: '', note: '', items: [], holding: false, holdLabel: '', ...opts.progress },
      _overlayPressed: false,
      confirm() { handlers.confirm(); },
      cancel() { handlers.cancel(); },
      remove() { if (handlers.remove) handlers.remove(); },
      holdConfirm() { if (handlers.holdConfirm) handlers.holdConfirm(); },
      /** ✕, Escape and overlay click — only for dismissible dialogs. */
      dismiss() { if (dlg.dismissible) handlers.cancel(); },
      overlayPress() { dlg._overlayPressed = true; },
      /** A press inside the window cancels a stale overlay press (one whose release happened elsewhere). */
      windowPress() { dlg._overlayPressed = false; },
      /** A click counts only if it also started on the overlay — a drag released there does not. */
      overlayClick() {
        const pressed = dlg._overlayPressed;
        dlg._overlayPressed = false;
        if (pressed) dlg.dismiss();
      },
      titlePress($event) {
        dlg._overlayPressed = false;
        dlg.popoutDragStart($event);
      },
      isProgress() { return dlg.variant === 'progress'; },
      hasItems() { return dlg.progress.items.length > 0; },
      itemClass(item) { return `action-modal__item action-modal__item--${item.status}`; },
      itemPending(item) { return item.status === 'pending'; },
      itemSettled(item) { return item.status !== 'pending'; },
      /** A :style binding (not x-show) so the hidden state lands in the same flush as the hold button. */
      spinnerStyle() { return dlg.progress.spinner ? '' : 'display:none'; },
      pendingMark() { return '·'; },
      itemIcon(item) { return STATUS_ICON[item.status] || ''; },
      itemIconClass(item) { return item.status === 'ok' ? 'icon icon--sm icon--success' : 'icon icon--sm icon--danger'; },
      itemStatusLabel(item) { return t(STATUS_LABEL[item.status]); },
    });

    const fragment = document.createDocumentFragment();
    fragment.append(...cloneTemplate(DIALOG_TEMPLATE));
    stripBlankText(fragment);
    const root = fragment.firstElementChild;
    Alpine.addScopeToNode(root, { dlg });
    document.body.append(root);
    Alpine.initTree(root);

    // Caller nodes go in AFTER initTree: a borrowed node is already an
    // initialised Alpine tree and must not be initialised a second time.
    const borrowed = [];
    place(root, 'body', slots.body, borrowed);
    place(root, 'footer-start', slots.footerStart, borrowed);

    const entry = { root, dlg, borrowed };
    stack.push(entry);
    if (stack.length === 1) window.addEventListener('keydown', onKeydown, true);
    return entry;
  }

  /**
   * Close one dialog: return borrowed nodes, tear down Alpine, remove the
   * root, pop the stack. Idempotent.
   * @param {object|null} entry
   * @returns {boolean} false when the dialog was already closed
   */
  function unmount(entry) {
    const i = entry ? stack.indexOf(entry) : -1;
    if (i < 0) return false;
    stack.splice(i, 1);
    if (stack.length === 0) window.removeEventListener('keydown', onKeydown, true);
    for (const b of entry.borrowed.reverse()) restore(b);
    Alpine.destroyTree(entry.root);
    entry.root.remove();
    return true;
  }

  /** Focus the confirm button once Alpine has rendered it. */
  function focusConfirm(entry) {
    Alpine.nextTick(() => entry.root.querySelector('.dialog__confirm')?.focus());
  }

  /**
   * Yes/no question.
   * @param {{ message: string, title?: string, confirmLabel?: string,
   *           cancelLabel?: string, danger?: boolean, size?: string }} opts
   * @returns {Promise<boolean>}
   */
  function confirm(opts) {
    return new Promise((resolve) => {
      let entry = null;
      const settle = (value) => { if (unmount(entry)) resolve(value); };
      entry = mount('confirm', opts, {}, { confirm: () => settle(true), cancel: () => settle(false) });
      focusConfirm(entry);
    });
  }

  /**
   * Message with one OK button.
   * @param {{ message: string, title?: string }} opts
   * @returns {Promise<void>}
   */
  function alert(opts) {
    return new Promise((resolve) => {
      let entry = null;
      const settle = () => { if (unmount(entry)) resolve(); };
      entry = mount('alert', opts, {}, { confirm: settle, cancel: settle });
      focusConfirm(entry);
    });
  }

  /**
   * Custom content without buttons.
   * @param {{ title: string, content: Node, size?: string, dismissible?: boolean }} opts
   * @returns {{ close: () => void }}
   */
  function show(opts) {
    let entry = null;
    const close = () => { unmount(entry); };
    entry = mount('show', opts, { body: opts.content }, { confirm: close, cancel: close });
    return { close };
  }

  /**
   * Form dialog. `content` is moved into the body slot (borrowed if it has a
   * DOM home). Settles exactly once — a late confirm()/cancel() from a caller
   * holding on to the api is a no-op and never re-runs onConfirm.
   * @param {{ title: string, content: Node, size?: string, confirmLabel?: string,
   *   cancelLabel?: string, hideConfirm?: boolean, deleteLabel?: string,
   *   onMount?: (body: HTMLElement, api: {confirm: Function, cancel: Function}) => void,
   *   onConfirm?: (body: HTMLElement) => (boolean|void),
   *   onDelete?: (body: HTMLElement) => (boolean|void),
   *   footerStart?: Node }} opts
   * @returns {Promise<true|false|'deleted'>}
   */
  function form(opts) {
    return new Promise((resolve) => {
      let entry = null;
      let settled = false;
      const body = () => entry.root.querySelector('[data-dialog-slot="body"]');
      const settle = (result) => {
        if (settled) return;
        settled = true;
        unmount(entry);
        resolve(result);
      };
      const runConfirm = () => {
        if (settled) return;
        if (opts.onConfirm && opts.onConfirm(body()) === false) return; // veto
        settle(true);
      };
      const runDelete = () => {
        if (settled) return;
        if (opts.onDelete(body()) === false) return; // veto
        settle('deleted');
      };
      const cancel = () => settle(false);
      entry = mount('form', opts, { body: opts.content, footerStart: opts.footerStart },
        { confirm: runConfirm, cancel, remove: runDelete });
      if (opts.onMount) {
        try {
          opts.onMount(body(), { confirm: runConfirm, cancel });
        } catch (err) {
          // Never leave a dead dialog behind: remove it, then reject.
          settled = true;
          unmount(entry);
          throw err;   // inside the executor → rejects the promise
        }
      }
    });
  }

  /**
   * A fresh progress controller (see progress.js). The app creates one.
   * @returns {object}
   */
  function progress() {
    return createProgress({
      i18n,
      openShell({ title, subtitle = '', onHoldConfirm }) {
        // The initial subtitle goes in with the state so the first render
        // already shows it (later changes only render on the next tick).
        const entry = mount('progress', { title, progress: { subtitle } }, {}, {
          confirm() {}, cancel() {}, holdConfirm: onHoldConfirm,
        });
        let observer = null;
        const cancelFocus = () => { if (observer) { observer.disconnect(); observer = null; } };
        return {
          dlg: entry.dlg,
          focusHold() {
            // The button is rendered by an x-if, so it does not exist yet:
            // focus it as soon as it shows up (the observer callback runs
            // after Alpine's flush).
            const find = () => entry.root.querySelector('.action-modal__confirm');
            cancelFocus();
            if (find()) { find().focus(); return; }
            const obs = new MutationObserver(() => {
              const btn = find();
              if (!btn) return;
              obs.disconnect();
              if (observer === obs) observer = null;
              btn.focus();
            });
            observer = obs;
            obs.observe(entry.root, { childList: true, subtree: true });
          },
          /** Stop waiting for the hold button (hold settled or dialog re-purposed). */
          cancelFocus,
          close() {
            cancelFocus();
            unmount(entry);
          },
        };
      },
    });
  }

  return { confirm, alert, form, show, progress };
}
