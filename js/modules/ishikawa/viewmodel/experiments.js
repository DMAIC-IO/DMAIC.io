/**
 * D.Mike — Ishikawa: view-Teil Experimente und Fakten.
 *
 * Zwei Tabellen (Experimente, Fakten), die beiden Dialoge zum Verknüpfen von
 * Ursachen und Experimenten, Zeitplan (Gantt) und Kostenverlauf. Felder
 * schreiben über `x-model`/`x-field` ins Model, Anlegen und Löschen über die
 * Model-Kommandos; die Dialoge senden `setExperimentHypotheses` bzw.
 * `setCauseExperiments` als ein Kommando. Die Diagramme sind `computed` und
 * zeichnen neu, sobald sich ein gelesenes Feld ändert; „heute“ wird beim
 * Rechnen gelesen.
 */
import { ordered, effCat, numbering } from '../domain/tree.js';
import { ganttConfig, costConfig } from './charts.js';

/**
 * Ein Eintrag im Dialog „Versuche verknüpfen“.
 * @typedef {object} ExpLinkItem
 * @property {number} id id des Experiments
 * @property {number} num Position in der Liste (ab 1)
 * @property {string} label Titel, sonst „Versuch #<n>“
 * @property {string} dateRange `Start → Ende`, leer ohne beide
 * @property {string} status
 * @property {string} statusLabel
 */

/**
 * Ein Eintrag im Dialog „Hypothesen wählen“.
 * @typedef {object} HypLinkItem
 * @property {string} stableId
 * @property {string} num Nummer im Baum
 * @property {string} cat wirksame Kategorie, `''` ohne
 * @property {string} name Name, sonst die stableId
 */

/** @type {import('./state.types.js').IshikawaViewFn} */
export const experimentsView = (ctx) => ({
  // ── Tabellen ──────────────────────────────────────────────

  /** Namen des Expertenteams als Vorschläge für Verantwortlich. @returns {string[]} */
  get ownerNames() { return this.model.experts.map((e) => e.name).filter(Boolean); },

  /** Klasse des Statusfelds. @param {{ status: string }} x @returns {string} */
  expStatusClass(x) { return `ishikawa__expstatus-${x.status}`; },

  /** „2 verknüpft“ oder die Aufforderung. @param {{ hypothesisIds: ReadonlyArray<string> }} x @returns {string} */
  expLinkText(x) {
    const n = x.hypothesisIds.length;
    return n > 0 ? `${n} ${this.t('linked')}` : this.t('chooseHypotheses');
  },

  /**
   * Vorschau der Geste an einer Zeile: gezogen oder Ziel.
   * @param {'experiments'|'facts'} kind Tabelle @param {number} id Zeile
   * @returns {string}
   */
  previewClass(kind, id) {
    const p = this.state.dragPreview;
    if (!p || p.kind !== kind) return '';
    if (p.ids.includes(id)) return 'dmike-table__row--dragging';
    const rest = this.model[kind].map((x) => x.id).filter((x) => x !== p.ids[0]);
    return rest[p.index] === id ? 'dmike-table__row--drop-target' : '';
  },

  // ── Verknüpfen ────────────────────────────────────────────

  /**
   * Dialog „Versuche verknüpfen“ für eine Ursache öffnen; nach dem Schließen
   * ist keine Ursache mehr gewählt.
   * @param {number} rowId Zeile des Baums @returns {Promise<void>}
   */
  async openExpLink(rowId) {
    const row = this.model.rows.find((r) => r.id === rowId);
    if (!row) return;
    this.state.linkCause = row.stableId;
    try {
      await ctx.openDialog('expLink', { args: { stableId: row.stableId }, title: this.t('linkExperimentsTitle') });
    } finally {
      this.state.linkCause = null;
    }
  },

  /** Hinweis im Dialog „Versuche verknüpfen“ mit dem Namen der Ursache. @returns {string} */
  get expLinkHint() {
    const row = this.model.rows.find((r) => r.stableId === this.state.linkCause);
    if (!row) return '';
    return this.t('chooseExperimentsHint', { name: row.name.trim() || row.stableId });
  },

  /** Einträge des Dialogs „Versuche verknüpfen“: alle Experimente. @returns {ExpLinkItem[]} */
  get expLinkItems() {
    return this.model.experiments.map((x, i) => ({
      id: x.id,
      num: i + 1,
      label: x.title.trim() || `${this.t('experiment')} #${i + 1}`,
      dateRange: x.startDate || x.endDate ? `${x.startDate || '?'} → ${x.endDate || '?'}` : '',
      status: x.status,
      statusLabel: this.t(`expStatus.${x.status}`),
    }));
  },

  /** Einträge des Dialogs „Hypothesen wählen“: alle Ursachen in Baumreihenfolge. @returns {HypLinkItem[]} */
  get hypLinkItems() {
    const rows = this.model.rows;
    const ord = ordered(rows);
    const nums = numbering(ord);
    return ord.map((r) => ({
      stableId: r.stableId,
      num: nums.get(r.id) ?? '',
      cat: effCat(rows, r),
      name: r.name.trim() || r.stableId,
    }));
  },

  // ── Diagramme ─────────────────────────────────────────────

  /** Hinweis statt des Zeitplans. @returns {string} */
  get ganttEmptyMsg() { return this.ganttChart ? '' : this.t('ganttNoData'); },

  /** Hinweis statt des kumulierten Kostenverlaufs. @returns {string} */
  get costEmptyMsg() { return this.costChart ? '' : this.t('costChartNoData'); },

  /** Hinweis statt der Kosten je Tag. @returns {string} */
  get costRateEmptyMsg() { return this.costRateChart ? '' : this.t('costChartNoData'); },

  /**
   * Feste Höhe des Gantt-Wirts aus der Zeilenzahl; ohne Diagramm keine (die
   * Mindesthöhe kommt aus dem CSS). Das Diagramm misst seinen Wirt — ohne
   * feste Höhe wüchse es bei jedem Neuzeichnen.
   * @returns {string}
   */
  get ganttHostStyle() {
    const c = this.ganttChart;
    if (!c) return '';
    const L = c.layout;
    return `height:${L.padT + c.tasks.length * L.rowH + L.padB}px`;
  },

  /** Feste Höhe der beiden Kosten-Wirte; ohne Diagramm keine. @returns {string} */
  get costHostStyle() {
    const c = this.costChart;
    if (!c) return '';
    const L = c.layout;
    return `height:${L.padT + L.innerH + L.padB}px`;
  },

  computed: {
    /**
     * Zeitplan der datierten Experimente; ohne `null`.
     * @returns {import('./charts.js').GanttConfig|null}
     */
    ganttChart() {
      return ganttConfig(this.model.experiments, { now: Date.now(), lang: ctx.i18n.getLanguage(), todayLabel: this.t('today') });
    },

    /**
     * Geld und Stunden kumuliert; ohne Kosten `null`.
     * @returns {import('./charts.js').CostConfig|null}
     */
    costChart() {
      return costConfig(this.model.experiments, 'cumulative', {
        now: Date.now(),
        lang: ctx.i18n.getLanguage(),
        moneyUnit: this.t('unit.money'),
        hoursUnit: this.t('unit.hours'),
        moneyLabel: this.t('costMoney'),
        hoursLabel: this.t('costHours'),
      });
    },

    /**
     * Geld und Stunden je Tag; ohne Kosten `null`.
     * @returns {import('./charts.js').CostConfig|null}
     */
    costRateChart() {
      return costConfig(this.model.experiments, 'rate', {
        now: Date.now(),
        lang: ctx.i18n.getLanguage(),
        moneyUnit: this.t('unit.moneyPerDay'),
        hoursUnit: this.t('unit.hoursPerDay'),
        moneyLabel: this.t('costMoney'),
        hoursLabel: this.t('costHours'),
      });
    },
  },
});
