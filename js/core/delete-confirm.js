/**
 * Generic delete confirmation.
 *
 * Every delete button in the app asks before it deletes — without each
 * module wiring its own dialog. A capture-phase click listener on the
 * document runs before any handler on the button itself (Alpine `@click`,
 * `addEventListener`), holds the click, asks, and on OK clicks the button
 * again with a one-shot pass, so the button's own handlers run unchanged.
 *
 * A delete button is a `button` / `[role="button"]` that
 *   - contains the trash icon (`[data-icon="action.delete"]`), or
 *   - carries `data-confirm-delete` (delete buttons with another glyph).
 * `data-confirm-delete="off"` opts a trash-icon button out.
 * `data-confirm-message` replaces the generic question with a specific one
 * (Alpine can bind it: `:data-confirm-message="vm.deleteMessage(id)"`).
 */

const TRIGGER = 'button, [role="button"]';
const TRASH = '[data-icon="action.delete"]';

/** Buttons whose next click has been confirmed and must pass through. */
const PASS = new WeakSet();

let wired = false;

/**
 * The delete button a click target belongs to, or null.
 * @param {EventTarget|null} target
 * @returns {HTMLElement|null}
 */
export function deleteButtonOf(target) {
  if (!(target instanceof Element)) return null;
  // The context-help badge sits inside buttons and handles its own click.
  if (target.closest('.context-help__btn')) return null;
  const btn = target.closest(TRIGGER);
  if (!btn) return null;
  const flag = btn.getAttribute('data-confirm-delete');
  if (flag === 'off') return null;
  if (flag !== null) return btn;
  return btn.querySelector(TRASH) ? btn : null;
}

/**
 * Start intercepting delete clicks. Idempotent.
 * @param {{ dialog: { confirm: (opts: object) => Promise<boolean> },
 *           i18n: { t: (key: string) => string } }} services
 */
export function startDeleteConfirm({ dialog, i18n }) {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  document.addEventListener('click', (event) => {
    const btn = deleteButtonOf(event.target);
    if (!btn) return;
    if (PASS.has(btn)) {
      PASS.delete(btn);
      return;
    }
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const message = btn.getAttribute('data-confirm-message') || i18n.t('common.confirmDelete');
    dialog.confirm({ message, danger: true, confirmLabel: i18n.t('common.delete') }).then((ok) => {
      if (!ok || !btn.isConnected) return;
      PASS.add(btn);
      btn.click();
      // `click()` dispatches synchronously; should a handler have stopped
      // the event before it reached the document, drop the pass anyway.
      PASS.delete(btn);
    });
  }, true);
}
