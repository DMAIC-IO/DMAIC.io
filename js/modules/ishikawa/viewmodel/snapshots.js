/**
 * D.Mike — Ishikawa: view-Teil Snapshots: Liste, Vergleich und Trend.
 *
 * Speichern läuft über das Formular (`saveSnapshot`), Löschen über
 * `x-command`, Laden per Doppelklick über das Model-Kommando mit seiner
 * Rückfrage. Ein Klick auf einen Snapshot vergleicht ihn mit dem aktuellen
 * Stand (`state.compareSnapId`); der Vergleich und die Pareto-Quelle heilen
 * beim Lesen, und nach `removeSnapshot` (Oberfläche oder Agent) zeigen sie
 * nicht mehr auf die gelöschte id — sonst würde ein neuer Snapshot mit
 * derselben id still Vergleich oder Quelle. Nach `loadSnapshot` ist nichts
 * mehr eingeklappt.
 */
import { runUiCommand } from '../../../core/command-directives.js';
import { compareRows } from '../domain/scores.js';
import { trendConfig } from './charts.js';
import { dateTimeText } from './dates.js';

/** @type {import('./state.types.js').IshikawaViewFn} */
export const snapshotsView = (ctx) => {
  /** @type {((e: { instanceId?: string, command?: string, args?: any }) => void)|null} */
  let onCommand = null;
  return {
    init() {
      onCommand = (e) => this.afterSnapshotCommand(e);
      ctx.eventBus?.on?.('command:executed', onCommand);
    },
    destroy() {
      if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
      onCommand = null;
    },

    /**
     * Handler nach jedem Kommando dieser Instanz: `loadSnapshot` klappt alles
     * auf, `removeSnapshot` beendet Vergleich und Pareto-Quelle auf der
     * gelöschten id.
     * @param {{ instanceId?: string, command?: string, args?: any }} e
     */
    afterSnapshotCommand(e) {
      if (e?.instanceId !== ctx.instanceId) return;
      if (e.command === 'loadSnapshot') this.state.collapsed = [];
      else if (e.command === 'removeSnapshot') {
        const id = e.args?.snapshotId;
        if (this.state.compareSnapId === id) this.state.compareSnapId = null;
        if (this.state.paretoSnapId === id) this.state.paretoSnapId = null;
      }
    },

    // ── Liste ─────────────────────────────────────────────────

    /** Datum und Uhrzeit eines Snapshots nach der Datumsregel des Moduls. @param {{ date: string }} s @returns {string} */
    snapDate(s) { return dateTimeText(s.date, ctx.i18n.getLanguage()); },

    /** „5 Hyp.“ @param {{ data: { rows: any[] } }} s @returns {string} */
    snapBadge(s) { return `${s.data.rows.length} ${this.t('hyp')}`; },

    /** Klasse eines Eintrags: der verglichene ist aktiv. @param {{ id: number }} s @returns {string} */
    snapClass(s) { return this.comparedSnapshot?.id === s.id ? 'ishikawa__snap-item--active' : ''; },

    /**
     * Klick auf einen Eintrag: vergleicht ihn, beim verglichenen endet der
     * Vergleich. Der Klick auf das Löschkreuz zählt nicht.
     * @param {number} id @param {Event} $event
     */
    snapClick(id, $event) {
      const target = /** @type {HTMLElement|null} */ ($event.target);
      if (target?.closest?.('.ishikawa__snap-del')) return;
      if (this.comparedSnapshot?.id === id) this.closeCompare({});
      else this.compareSnapshot({ snapshotId: /** @type {any} */ (id) });
    },

    /** Doppelklick: den Snapshot nach Rückfrage laden. @param {number} id @returns {Promise<void>} */
    async loadFromList(id) {
      await runUiCommand(this._ui, 'loadSnapshot', { snapshotId: id });
    },

    // ── Vergleich ─────────────────────────────────────────────

    /** Der verglichene Snapshot; gelöscht oder keiner: `null`. */
    get comparedSnapshot() {
      const id = this.state.compareSnapId;
      return id === null ? null : (this.model.snapshots.find((s) => s.id === id) ?? null);
    },

    /** „vs. „<Name>““ während des Vergleichs, sonst leer. @returns {string} */
    get compareLabel() {
      const s = this.comparedSnapshot;
      return s ? this.t('compareTitle', { name: s.name }) : '';
    },

    /** Klasse des Banners: offen während des Vergleichs. @returns {string} */
    get diffBannerClass() { return this.diff ? 'ishikawa__diff-banner--visible' : ''; },

    /** „+2 neu“ @returns {string} */
    get diffNewText() { return this.diff ? `+${this.diff.added.length} ${this.t('diffNew')}` : ''; },
    /** „−1 entfernt“ @returns {string} */
    get diffRemovedText() { return this.diff ? `−${this.diff.removed.length} ${this.t('diffRemoved')}` : ''; },
    /** „~3 Score Δ“ @returns {string} */
    get diffChangedText() { return this.diff ? `~${this.diff.changed.length} ${this.t('diffChanged')}` : ''; },

    /**
     * Klasse einer Tabellenzeile im Vergleich: neu oder mit geändertem Score.
     * @param {{ row: { stableId: string } }} vr @returns {string}
     */
    diffClass(vr) {
      const d = this.diff;
      if (!d) return '';
      if (d.added.includes(vr.row.stableId)) return 'ishikawa__diff-new';
      return this.scoreDelta(vr) ? 'ishikawa__diff-chg' : '';
    },

    /**
     * Die Score-Änderung einer Zeile im Vergleich, sonst `null`.
     * @param {{ row: { stableId: string } }} vr @returns {import('../domain/scores.js').RowDiff|null}
     */
    scoreDelta(vr) {
      return this.diff?.changed.find((c) => c.stableId === vr.row.stableId) ?? null;
    },

    /** Klasse der Score-Änderung. @param {{ delta: number }} d @returns {string} */
    deltaClass(d) { return d.delta > 0 ? 'ishikawa__delta-up' : 'ishikawa__delta-down'; },

    /** Score-Änderung mit Vorzeichen im Zahlformat der Sprache. @param {{ delta: number }} d @returns {string} */
    deltaText(d) { return (d.delta > 0 ? '+' : '') + this.num(d.delta, 1); },

    // ── Trend ─────────────────────────────────────────────────

    /** Trend auf oder zu. */
    toggleTrend() { this.state.trendVisible = !this.state.trendVisible; },

    /** Trend schließen. */
    closeTrend() { this.state.trendVisible = false; },

    /** Hinweis statt des Trends; leer, wenn der Trend zu ist oder etwas zeigt. @returns {string} */
    get trendEmptyMsg() {
      if (!this.state.trendVisible || this.trendChart) return '';
      return this.t(this.model.snapshots.length ? 'trendNoData' : 'trendMinSnaps');
    },

    computed: {
      /**
       * Vergleich mit dem Snapshot aus `state.compareSnapId`; ohne Vergleich
       * oder mit gelöschtem Snapshot `null`.
       * @returns {import('../domain/scores.js').SnapshotDiff|null}
       */
      diff() {
        const snap = this.comparedSnapshot;
        return snap ? compareRows(this.model.rows, snap.data.rows) : null;
      },

      /**
       * Trend der Scores über die Snapshots (ältester zuerst) bis zum
       * aktuellen Stand; nur bei offenem Trend.
       * @returns {import('./charts.js').TrendConfig|null}
       */
      trendChart() {
        if (!this.state.trendVisible) return null;
        /** @type {import('./charts.js').TrendState[]} */
        const states = [...this.model.snapshots].reverse().map((s) => ({ name: s.name, date: s.date, data: s.data }));
        states.push({
          name: this.t('trendCurrent'),
          date: new Date().toISOString(),
          data: { rows: this.model.rows, experts: this.model.experts },
        });
        return trendConfig(states, { lang: ctx.i18n.getLanguage() });
      },
    },
  };
};
