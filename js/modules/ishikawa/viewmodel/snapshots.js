/**
 * D.Mike — Ishikawa snapshots (viewmodel/snapshots.js)
 *
 * Sub-viewmodel of the snapshot bar on the hypotheses tab: save, load and
 * delete snapshots, compare one with the current tree, and the trend chart
 * over all snapshots. Knows the model, the pure ishikawa-*.js helpers and
 * core modules — never a sibling or the shell. Tells the others
 * about comparisons, deletions and loads over the instance bus; redraws the
 * trend when the causes change.
 */

import { computeTrendConfig } from '../ishikawa-charts.js';
import { EVENTS } from '../ishikawa-constants.js';
import { requireKnownId, requireText } from '../../../core/agent/agent-argcheck.js';

/**
 * The diff as plain data: live rows become their stableId, Sets disappear.
 * @param {{added: object[], removed: object[], changed: Array<{row: object, oldScore: number, newScore: number, delta: number}>}} diff
 * @returns {{added: string[], removed: string[], changed: Array<{stableId: string, oldScore: number, newScore: number, delta: number}>}}
 */
function plainDiff(diff) {
  return {
    added: diff.added.map((r) => r.stableId),
    removed: diff.removed.map((r) => r.stableId),
    changed: diff.changed.map((c) => ({ stableId: c.row.stableId, oldScore: c.oldScore, newScore: c.newScore, delta: c.delta })),
  };
}

export class SnapshotsViewModel {
  /**
   * Gets only what exists before the mount; the model comes with attach().
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    /** @type {string} name typed for the next snapshot */
    this.snapDraft = '';
    /** @type {?number} snapshot compared with the current tree */
    this.compareSnapId = null;
    /** @type {boolean} whether the trend panel is open */
    this.trendVisible = false;
    /** @type {Object<string, true>} trend lines the user switched off, by stableId */
    this.hiddenLines = {};
    /** @type {string} empty-state message of the trend chart */
    this.trendEmptyMsg = '';
    this._trendChart = null;
    // Own stale guard: the trend renders concurrently with the Pareto chart.
    this._trendGen = 0;
    this._offs = [];
    this._emit = () => {};
    this._nextTick = (cb) => cb();
  }

  /**
   * Binds the model and subscribes to causes:changed. Called
   * through the Alpine proxy, so the listener writes reactive state.
   * @noagent lifecycle
   * @param {{model: object, events: object, watch: function, nextTick: function, ref: function(string): ?Element}} binding
   */
  attach({ model, events, nextTick }) {
    this.model = model;
    this._nextTick = nextTick;
    this._emit = (name, payload) => events.emit(name, payload);
    const onCausesChanged = () => { if (this.trendVisible) this.renderTrend(); };
    events.on(EVENTS.causesChanged, onCausesChanged);
    this._offs = [() => events.off(EVENTS.causesChanged, onCausesChanged)];
  }

  /**
   * Unsubscribes and destroys the trend chart.
   * @noagent lifecycle
   */
  detach() {
    this._offs.forEach((off) => off());
    this._offs = [];
    this._emit = () => {};
    // A create() still in flight sees a stale generation and destroys its chart.
    ++this._trendGen;
    this._destroyTrend();
  }

  /**
   * Draws the trend if its panel is open.
   * @noagent chart
   */
  render() {
    if (this.trendVisible) this.renderTrend();
  }

  /**
   * Save problem statement, experts and cause tree as a snapshot (newest first).
   * @agent
   * @param {string} name the name; "" gives "Snapshot <today>"
   * @returns {number} id of the new snapshot
   * @throws {Error} if `name` is not a string
   */
  saveSnapshot(name) {
    const text = requireText('name', name).trim();
    this.model.saveSnapshot(text || `Snapshot ${new Date().toLocaleDateString('de-DE')}`);
    this._nextTick(() => this.render());
    return this.model.snapshots[0].id;
  }

  /** @noagent template handler: saves under the typed name and clears it */
  submitSnapDraft() {
    this.saveSnapshot(this.snapDraft || '');
    this.snapDraft = '';
  }

  /**
   * Replace problem statement, experts and cause tree by a snapshot, without asking.
   * @agent
   * @param {number} snapshotId the snapshot
   * @returns {void}
   * @throws {Error} if the snapshot is unknown
   */
  loadSnapshot(snapshotId) {
    requireKnownId('snapshotId', snapshotId, this.model.snapshots.map((s) => s.id));
    this.model.loadSnapshot(snapshotId);
    this._emit(EVENTS.snapshotLoaded, { id: snapshotId });
    this._nextTick(() => this.render());
  }

  /**
   * @noagent asks first; agents call loadSnapshot
   * @param {number} id snapshot id
   * @returns {Promise<void>}
   */
  async confirmLoadSnapshot(id) {
    const confirmed = await this._context.dialog.confirm({ message: this._t('loadSnapConfirm') });
    // The snapshot may have gone while the dialog was open (an agent call).
    if (!confirmed || !this.model.snapshots.some(s => s.id === id)) return;
    this.loadSnapshot(id);
  }

  /**
   * Delete a snapshot, without asking. A comparison with it ends.
   * @agent
   * @param {number} snapshotId the snapshot
   * @returns {void}
   * @throws {Error} if the snapshot is unknown
   */
  removeSnapshot(snapshotId) {
    requireKnownId('snapshotId', snapshotId, this.model.snapshots.map((s) => s.id));
    this.model.removeSnapshot(snapshotId);
    if (this.compareSnapId === snapshotId) this.closeCompare();
    this._emit(EVENTS.snapshotRemoved, { id: snapshotId });
    this._nextTick(() => this.render());
  }

  /**
   * @noagent template handler: the delete button inside a snapshot item
   * @param {number} id snapshot id
   * @param {Event} $event click event (kept from reaching snapClick)
   */
  removeFromList(id, $event) {
    $event.stopPropagation();
    this.removeSnapshot(id);
  }

  /**
   * Compare the cause tree with a snapshot; the tree marks the differences
   * until the comparison ends.
   * @agent
   * @param {number} snapshotId the snapshot
   * @returns {{added: string[], removed: string[], changed: Array<{stableId: string, oldScore: number, newScore: number, delta: number}>}} stableIds of new and missing causes, and each cause whose score changed
   * @throws {Error} if the snapshot is unknown
   */
  compareSnapshot(snapshotId) {
    requireKnownId('snapshotId', snapshotId, this.model.snapshots.map((s) => s.id));
    this.compareSnapId = snapshotId;
    this._emit(EVENTS.snapshotCompared, { id: snapshotId });
    return plainDiff(this.model.getDiff(snapshotId));
  }

  /**
   * End the comparison with a snapshot.
   * @agent
   * @returns {void}
   */
  closeCompare() {
    this.compareSnapId = null;
    this._emit(EVENTS.snapshotCompared, { id: null });
  }

  /**
   * @noagent template handler: click on a snapshot item toggles its comparison
   * @param {number} id snapshot id
   * @param {Event} $event click event
   */
  snapClick(id, $event) {
    if ($event.target.closest('.ishikawa__snap-del')) return;
    if (this.compareSnapId === id) this.closeCompare();
    else this.compareSnapshot(id);
  }

  /** @noagent view transform @param {{date: string}} s snapshot @returns {string} date and time, de-DE */
  snapDate(s) {
    const d = new Date(s.date);
    return `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  }

  /** @noagent view transform @param {{data: {rows?: Array}}} s snapshot @returns {string} "<n> Hyp." */
  snapBadge(s) { return `${(s.data.rows || []).length} ${this._t('hyp')}`; }

  /** @noagent view transform @returns {string} 'vs. „<name>“' while comparing, else "" */
  compareLabel() {
    const s = this.model.snapshots.find(x => x.id === this.compareSnapId);
    return s ? `vs. „${s.name}“` : '';
  }

  /** @noagent view only: opens or closes the trend panel */
  toggleTrend() {
    this.trendVisible = !this.trendVisible;
    if (this.trendVisible) this._nextTick(() => this.renderTrend());
  }

  /** @noagent view only */
  closeTrend() { this.trendVisible = false; }

  // ── Trend chart (chartManager — framework `trend` type) ───────

  _destroyTrend() {
    if (this._trendChart) {
      try { this._context.chartManager.destroy(this._trendChart); } catch { /* ignore */ }
      this._trendChart = null;
    }
  }

  /**
   * @noagent chart
   * @returns {Promise<void>}
   */
  async renderTrend() {
    const container = this._container()?.querySelector('[data-ref="trendContent"]');
    if (!container) return;
    this._destroyTrend();
    // Trend axis dates are formatted by locale (de/en), as before the split.
    const timeline = [...this.model.snapshots].reverse();
    const currentState = {
      name: this._t('trendCurrent'),
      date: new Date().toISOString(),
      data: { problem: this.model.problem, experts: JSON.parse(JSON.stringify(this.model.experts)), rows: JSON.parse(JSON.stringify(this.model.rows)) },
    };
    const trendStates = [...timeline.map(s => ({ name: s.name, date: s.date, data: s.data })), currentState];
    const lang = this._context.language || 'de';
    const config = computeTrendConfig(trendStates, {
      calcScore: (row, experts) => this.model.calcScoreFor(row, experts),
      lang,
    });
    if (config.isEmpty) {
      container.replaceChildren();
      this.trendEmptyMsg = config.reason === 'noData' ? this._t('trendNoData') : this._t('trendMinSnaps');
      return;
    }
    this.trendEmptyMsg = '';
    // Re-apply the user's per-series toggles (survive data-driven re-renders).
    config.series.forEach(s => { if (this.hiddenLines[s.sid]) s.visible = false; });
    container.replaceChildren();
    const gen = ++this._trendGen;
    const chart = await this._context.chartManager.create(container, 'trend', {
      ...config,
      onToggle: (sid, hidden) => {
        if (hidden) this.hiddenLines[sid] = true; else delete this.hiddenLines[sid];
      },
    });
    if (gen !== this._trendGen) { this._context.chartManager.destroy(chart); return; }
    this._trendChart = chart;
  }
}
