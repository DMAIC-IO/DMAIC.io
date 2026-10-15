/**
 * D.Mike — Progress dialog (ui/dialog/progress.js)
 * Non-dismissible progress dialog shown while an action verb runs (e.g.
 * loading a scenario), on top of the dialog service.
 *
 * Instance contract: createProgress() holds NO module-level state — every
 * call returns an independent controller. The app creates exactly ONE
 * (app.js, `dialog.progress()`) and passes it to both buildFrame() and
 * initRouter(): the router feeds it the scenario item events, so the help
 * panel's example load must drive the same instance to show the item rows.
 *
 * Not dismissible on purpose: aborting halfway through would leave a
 * half-built project behind. There is no ✕, no Escape, no overlay click.
 */

/**
 * Row markers for ok/failed. `pending` shows a typographic dot — the meaning
 * is carried by the translated aria-label and by the row's colour.
 */
export const STATUS_ICON = { ok: 'status.ok', failed: 'status.error' };

/** Translated aria-label key per row status. */
export const STATUS_LABEL = { pending: 'actions.itemPending', ok: 'actions.itemLoaded', failed: 'actions.itemFailed' };

/**
 * The state the dialog holds in once a scenario has finished loading — ONE
 * flavour for every entry point (the `scenario` action verb and the help
 * panel's examples tab), so the two can never drift apart.
 *
 * Failure-aware on purpose: a warning toast sits BELOW the dialog overlay and
 * expires after a few seconds, while this dialog holds until the user clicks.
 * Failed items are named by example id ONLY — `failed[].error` is
 * untranslated developer text and belongs in the console.
 *
 * @param {object} args
 * @param {object} args.i18n
 * @param {{loaded: string[], failed: {exampleId: string}[]}|null} args.result
 * @param {number} args.total                 items the scenario declared
 * @param {string} [args.confirmLabel]        i18n key; defaults to `actions.startNow`
 * @returns {{title: string, subtitle: string, note: string|null, confirmLabel: string}}
 */
export function scenarioDoneState({ i18n, result, total, confirmLabel }) {
  const failed = result?.failed ?? [];
  return {
    title: i18n.t(failed.length ? 'actions.scenarioPartial' : 'actions.scenarioReady'),
    subtitle: i18n.t('actions.scenarioLoaded', { loaded: result?.loaded?.length ?? 0, total }),
    note: failed.length
      ? i18n.t('actions.scenarioItemsFailed', { items: failed.map(f => f.exampleId).join(', ') })
      : null,
    confirmLabel: i18n.t(confirmLabel || 'actions.startNow'),
  };
}

/**
 * @param {object} deps
 * @param {object} deps.i18n
 * @param {(o: {title: string, subtitle: string, onHoldConfirm: () => void}) =>
 *   {dlg: object, focusHold: () => void, cancelFocus: () => void, close: () => void}} deps.openShell
 * @returns {object} progress controller (see dialog.js `progress()`)
 */
export function createProgress({ i18n, openShell }) {
  let shell = null;
  /** Resolver of a pending hold(), if the dialog currently waits for a confirm. */
  let releaseHold = null;

  /**
   * Settle a pending hold(): `true` = the user confirmed, `false` = the
   * dialog was closed or re-purposed. Cleared first so a re-entrant close()
   * cannot resolve it twice.
   * @param {boolean} confirmed
   */
  function settleHold(confirmed) {
    const release = releaseHold;
    releaseHold = null;
    if (release) release(confirmed);
  }

  function reset(title, subtitle) {
    shell.cancelFocus();
    const p = shell.dlg.progress;
    shell.dlg.title = title;
    p.spinner = true;
    p.subtitle = subtitle;
    p.line = '';
    p.note = '';
    p.items = [];
    p.holding = false;
    p.holdLabel = '';
  }

  const api = {
    /** @param {{title: string, subtitle?: string}} o */
    open({ title, subtitle = '' }) {
      // Re-purposing a holding dialog cancels the hold: its button is about
      // to disappear, so nobody will ever confirm it.
      settleHold(false);
      if (!shell) shell = openShell({ title, subtitle, onHoldConfirm: () => settleHold(true) });
      reset(title, subtitle);
    },

    /** @param {string} text */
    update(text) { if (shell) shell.dlg.progress.line = text; },

    /**
     * Add one item — newest FIRST, so what just happened is readable without
     * scrolling. Starts pending; markItem() settles it. No-op while closed.
     * @param {{id: string|number, label: string}} item
     */
    addItem({ id, label }) {
      if (!shell) return;
      const items = shell.dlg.progress.items;
      if (items.some(it => it.id === id)) return;
      items.unshift({ id, label, status: 'pending' });
    },

    /**
     * Settle the row added for `id`. Unknown ids are ignored.
     * @param {string|number} id  @param {boolean} ok
     */
    markItem(id, ok) {
      if (!shell) return;
      const item = shell.dlg.progress.items.find(it => it.id === id);
      if (item) item.status = ok ? 'ok' : 'failed';
    },

    /**
     * Turn the running dialog into a "done" state that waits for the user.
     * @param {{title: string, subtitle?: string, note?: string|null, confirmLabel?: string}} o
     * @returns {Promise<boolean>} true on confirm, false on a forced close/re-open
     */
    async hold({ title, subtitle = '', note = null, confirmLabel }) {
      if (!shell) return false;
      const p = shell.dlg.progress;
      shell.dlg.title = title;
      p.spinner = false;
      p.subtitle = subtitle;
      p.line = '';
      p.note = note || '';
      p.holdLabel = confirmLabel || i18n.t('actions.startNow');
      p.holding = true;
      const confirmed = await new Promise((resolve) => {
        releaseHold = resolve;
        shell.focusHold();
      });
      // Only the confirm path closes: on a forced close the dialog is gone
      // already, and on a re-open closing here would kill the NEW dialog.
      if (confirmed) api.close();
      return confirmed;
    },

    /**
     * Close the dialog and settle a pending hold() with `false`. Idempotent.
     *
     * Routing obligation: force-closing a PENDING hold() makes you responsible
     * for navigating away from the `#/action/…` hash yourself. The router
     * deliberately skips its own navigation in that case.
     */
    close() {
      if (shell) shell.close();
      shell = null;
      settleHold(false);   // after teardown: the awaiting caller sees a closed dialog
    },

    /** @returns {boolean} */
    isOpen() { return shell !== null; },
  };

  return api;
}
