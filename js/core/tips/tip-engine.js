/**
 * D.Mike — Tip Engine (tip-engine.js)
 * Lightweight, decoupled hint system. Subscribes to semantic events on
 * the global EventBus and renders contextual tips into the footer slot.
 *
 * Tips are declared in `tips.json`:
 *   [{ id, event, i18nKey, condition? }]
 *
 * Filter chain per tip:
 *   1. `settings.tipsEnabled` (false → engine inactive)
 *   2. `settings.tipsDismissed` contains tip.id (lifetime dismiss)
 *   3. tip already shown this session
 *
 * Other engines stay agnostic — they just emit their own semantic events.
 * The optional `bridgeEmitter()` helper re-emits internal events from a
 * source (e.g. DataGrid) onto the global bus with a namespace prefix.
 */

const AUTO_HIDE_MS = 12000;

/**
 * Built-in condition predicates referenced by `conditionId` in tips.json.
 * Each predicate receives the event payload and returns a boolean.
 *
 * Extend via {@link TipEngine.registerCondition} when a new tip needs a
 * condition not covered here — keeps the registry declarative without
 * coupling tip-emitting engines to the tip system.
 */
const BUILTIN_CONDITIONS = {
  isFormulaCell:    (p) => p?.activeCell != null && p.activeCell.formula != null,
  isNotFormulaCell: (p) => p?.activeCell != null && p.activeCell.formula == null,
};

export class TipEngine {
  /**
   * @param {object} deps
   * @param {import('../event-bus.js').EventBus} deps.eventBus
   * @param {import('../state-manager.js').StateManager} deps.stateManager
   * @param {import('../i18n.js').I18n} deps.i18n
   */
  constructor({ eventBus, stateManager, i18n }) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.i18n = i18n;
    this.tips = [];
    this._conditions = { ...BUILTIN_CONDITIONS };
    this._shownThisSession = new Set();
    this._currentTip = null;
    this._hideTimerId = null;
    this._slotEl = null;
    this._textEl = null;
    this._dismissBtn = null;
  }

  async init() {
    this._slotEl     = document.getElementById('footer-tip');
    if (!this._slotEl) return;
    this._textEl     = this._slotEl.querySelector('.app-footer__tip-text');
    this._dismissBtn = this._slotEl.querySelector('.app-footer__tip-dismiss');

    try {
      const res = await fetch('js/core/tips/tips.json');
      this.tips = await res.json();
    } catch (err) {
      console.warn('[TipEngine] Failed to load tips registry', err);
      return;
    }

    this._dismissBtn?.addEventListener('click', () => this._dismissCurrent());

    this.tips.forEach(tip => {
      this.eventBus.on(tip.event, payload => this._maybeShow(tip, payload));
    });

    // Support synthetic tip:fire events (used in testing / manual trigger)
    this.eventBus.on('tip:fire', (payload) => {
      if (!this._isEnabled() || !payload?.text) return;
      if (!this._slotEl || !this._textEl) return;
      this._currentTip = { id: '__manual__' };
      this._textEl.textContent = payload.text;
      this._show();
    });

    // Re-render visible tip on language switch
    this.eventBus.on('language:changed', () => {
      if (this._currentTip) this._renderText(this._currentTip);
    });
  }

  /**
   * Register a condition predicate addressable by `conditionId` in
   * tips.json. Overrides any built-in with the same id.
   * @param {string} id
   * @param {(payload: any) => boolean} fn
   */
  registerCondition(id, fn) {
    this._conditions[id] = fn;
  }

  /**
   * Clear the lifetime-dismiss list and the session-shown set so all
   * tips become eligible again.
   */
  resetDismissed() {
    this.stateManager.set('settings.tipsDismissed', []);
    this._shownThisSession.clear();
  }

  // ─── Internal ────────────────────────────────────────────

  _isEnabled() {
    return this.stateManager.get('settings.tipsEnabled') !== false;
  }

  _isDismissed(tipId) {
    const list = this.stateManager.get('settings.tipsDismissed') || [];
    return list.includes(tipId);
  }

  _maybeShow(tip, payload) {
    if (!this._isEnabled()) return;
    if (this._isDismissed(tip.id)) return;
    if (this._shownThisSession.has(tip.id)) return;
    if (tip.conditionId) {
      const cond = this._conditions[tip.conditionId];
      if (typeof cond !== 'function') {
        console.warn(`[TipEngine] Unknown conditionId "${tip.conditionId}" for tip "${tip.id}"`);
        return;
      }
      if (!cond(payload)) return;
    }
    this._shownThisSession.add(tip.id);
    this._currentTip = tip;
    this._renderText(tip);
    this._show();
  }

  _renderText(tip) {
    if (!this._textEl) return;
    this._textEl.textContent = this.i18n.t(tip.i18nKey);
  }

  _show() {
    if (!this._slotEl) return;
    this._slotEl.hidden = false;
    clearTimeout(this._hideTimerId);
    this._hideTimerId = setTimeout(() => this._hide(), AUTO_HIDE_MS);
  }

  _hide() {
    if (!this._slotEl) return;
    this._slotEl.hidden = true;
    this._currentTip = null;
    clearTimeout(this._hideTimerId);
  }

  _dismissCurrent() {
    if (!this._currentTip) { this._hide(); return; }
    const list = this.stateManager.get('settings.tipsDismissed') || [];
    if (!list.includes(this._currentTip.id)) {
      list.push(this._currentTip.id);
      this.stateManager.set('settings.tipsDismissed', list);
    }
    this._hide();
  }
}

/**
 * Re-emit events from a local emitter (DataGrid, Chart, …) onto the
 * global EventBus with a namespace prefix. Called once per source
 * instance; the source itself stays unaware of the global bus.
 *
 * @param {{ emit: Function }} source  Object with a CommonJS-style emit(event, payload)
 * @param {{ emit: Function }} eventBus  Global EventBus
 * @param {string} prefix  Namespace prefix, e.g. 'datagrid'
 */
export function bridgeEmitter(source, eventBus, prefix) {
  const original = source.emit.bind(source);
  source.emit = (event, payload) => {
    original(event, payload);
    eventBus.emit(`${prefix}:${event}`, payload);
  };
}
