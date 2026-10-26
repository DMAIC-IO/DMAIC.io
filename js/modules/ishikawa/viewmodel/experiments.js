/**
 * D.Mike — Ishikawa experiments (viewmodel/experiments.js)
 *
 * Sub-viewmodel of the facts and experiments tabs: facts, experiments, the
 * two link forms between causes and experiments, and the Gantt and cost
 * charts. Knows the model, the pure ishikawa-*.js helpers and core modules —
 * never a sibling or the shell. Needs no bus event: links to
 * causes are read from the model on every render.
 */

import { computeGanttConfig, computeCostConfig } from '../ishikawa-charts.js';
import { catLabel, catColor } from '../ishikawa-labels.js';
import { requireEnum, requireKnownId, requireNumber, requireText } from '../../../core/agent/agent-argcheck.js';
import { isIsoDate } from '../../../core/local-date.js';

/**
 * "" or a calendar date YYYY-MM-DD.
 * @param {*} v
 * @returns {string}
 * @throws {Error} for anything else
 */
function dateText(v) {
  const s = requireText('value', v);
  if (s !== '' && !isIsoDate(s)) {
    throw new Error(`invalid value ${JSON.stringify(v)}; allowed: a date as YYYY-MM-DD, "" clears it`);
  }
  return s;
}

/**
 * null (or "") for none, else a number of at least 0.
 * @param {*} v
 * @returns {number|null}
 * @throws {Error} for anything else
 */
function optionalAmount(v) {
  if (v === null || v === '') return null;
  return requireNumber('value', v, { min: 0 });
}

/**
 * Fields of an experiment.
 * @typedef {object} ExperimentFields
 * @property {string} title  short title of the experiment
 * @property {string} description  what is tried and how the result is measured
 * @property {string} responsible  who runs the experiment
 * @property {'planned'|'running'|'done'|'cancelled'} status  where the experiment stands
 * @property {string} startDate  first day as YYYY-MM-DD, "" for none
 * @property {string} endDate  last day as YYYY-MM-DD, "" for none
 * @property {number|null} costMoney  money spent in euros, null for none
 * @property {number|null} costHours  effort in hours, null for none
 */

const EXPERIMENT_KEYS = ['title', 'description', 'responsible', 'status', 'startDate', 'endDate', 'costMoney', 'costHours'];
const EXPERIMENT_STATUS = ['planned', 'running', 'done', 'cancelled'];
const EXPERIMENT_CHECKS = {
  title: (v) => requireText('value', v),
  description: (v) => requireText('value', v),
  responsible: (v) => requireText('value', v),
  status: (v) => { requireEnum('value', v, EXPERIMENT_STATUS); return v; },
  startDate: (v) => dateText(v),
  endDate: (v) => dateText(v),
  costMoney: (v) => optionalAmount(v),
  costHours: (v) => optionalAmount(v),
};

/**
 * Fields of a fact.
 * @typedef {object} FactFields
 * @property {string} name  what was observed
 * @property {string} description  details and source of the observation
 * @property {string} date  when it was observed, YYYY-MM-DD, "" for none
 * @property {string} owner  who reported it
 */

const FACT_KEYS = ['name', 'description', 'date', 'owner'];
const FACT_CHECKS = {
  name: (v) => requireText('value', v),
  description: (v) => requireText('value', v),
  date: (v) => dateText(v),
  owner: (v) => requireText('value', v),
};

export class ExperimentsViewModel {
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
    /** @type {{hint: string, items: Array<object>}} draft of the link-experiments form */
    this.expLinkDraft = { hint: '', items: [] };
    /** @type {{items: Array<object>}} draft of the choose-causes form */
    this.hypLinkDraft = { items: [] };
    /** @type {string} empty-state message of the Gantt chart */
    this.ganttEmptyMsg = '';
    /** @type {string} empty-state message of the cumulative cost chart */
    this.costEmptyMsg = '';
    /** @type {string} empty-state message of the cost-rate chart */
    this.costRateEmptyMsg = '';
    this._ganttChart = null;
    this._costCumChart = null;
    this._costRateChart = null;
    // One stale guard per chart: the three experiment-tab charts render
    // concurrently, a shared counter would let one async create()
    // cannibalize another's freshly mounted chart.
    this._ganttGen = 0;
    this._costGen = { cumulative: 0, rate: 0 };
    this._nextTick = (cb) => cb();
    this._ref = () => null;
  }

  /**
   * Binds the component's model, nextTick and the template refs.
   * @noagent lifecycle
   * @param {{model: object, events: object, watch: function, nextTick: function, ref: function(string): ?Element}} binding
   */
  attach({ model, nextTick, ref }) {
    this.model = model;
    this._nextTick = nextTick;
    this._ref = ref;
  }

  /**
   * Destroys the Gantt and cost charts.
   * @noagent lifecycle
   */
  detach() {
    // A create() still in flight sees a stale generation and destroys its chart.
    ++this._ganttGen;
    this._costGen.cumulative++;
    this._costGen.rate++;
    this._destroyGantt();
    this._destroyCostCharts();
  }

  /**
   * Draws all three charts; a chart whose host is not mounted is skipped.
   * @noagent chart
   */
  render() {
    this.renderGantt();
    this.renderCostChart('cumulative');
    this.renderCostChart('rate');
  }

  // ── Experiments ───────────────────────────────────────────

  /**
   * Add an empty experiment (status planned) at the end.
   * @agent
   * @returns {number} id of the new experiment
   */
  addExperiment() {
    const x = this.model.addExperiment();
    this._nextTick(() => this.render());
    return x.id;
  }

  /**
   * Set one field of an experiment.
   * @agent
   * @param {number} experimentId the experiment
   * @param {keyof ExperimentFields} key which field
   * @param {string|number|null} value the new value, as described per field
   * @returns {void}
   * @throws {Error} if the experiment is unknown, `key` is no experiment field or the value does not fit it
   */
  setExperimentField(experimentId, key, value) {
    requireKnownId('experimentId', experimentId, this.model.experiments.map((x) => x.id));
    requireEnum('key', key, EXPERIMENT_KEYS);
    const next = EXPERIMENT_CHECKS[key](value);
    this.model.experiments.find((x) => x.id === experimentId)[key] = next;
    this._nextTick(() => this.render());
  }

  /**
   * Delete an experiment, without asking.
   * @agent
   * @param {number} experimentId the experiment
   * @returns {void}
   * @throws {Error} if the experiment is unknown
   */
  deleteExperiment(experimentId) {
    requireKnownId('experimentId', experimentId, this.model.experiments.map((x) => x.id));
    this.model.removeExperiment(experimentId);
    this._nextTick(() => this.render());
  }

  /**
   * @noagent asks first; agents call deleteExperiment
   * @param {number} id experiment id
   * @returns {Promise<void>}
   */
  async confirmDeleteExperiment(id) {
    const x = this.model.experiments.find(y => y.id === id);
    if (!x) return;
    const label = (x.title && x.title.trim()) || `#${this.model.experiments.indexOf(x) + 1}`;
    const ok = await this._context.dialog.confirm({
      message: this._t('delExperimentConfirm', { name: label }),
      title: this._context.i18n.t('common.delete'),
      confirmLabel: this._context.i18n.t('common.delete'),
      danger: true,
    });
    // The experiment may have gone while the dialog was open (an agent call).
    if (!ok || !this.model.experiments.some(y => y.id === id)) return;
    this.deleteExperiment(id);
  }

  /**
   * Move an experiment directly before another one.
   * @agent
   * @param {number} experimentId the experiment to move
   * @param {number} targetExperimentId the experiment it goes before
   * @returns {void}
   * @throws {Error} if either experiment is unknown
   */
  moveExperimentBefore(experimentId, targetExperimentId) {
    const ids = this.model.experiments.map((x) => x.id);
    requireKnownId('experimentId', experimentId, ids);
    requireKnownId('targetExperimentId', targetExperimentId, ids);
    this.model.moveExperimentBefore(experimentId, targetExperimentId);
    this._nextTick(() => this.render());
  }

  /**
   * Set which causes an experiment checks.
   * @agent
   * @param {number} experimentId the experiment
   * @param {string[]} hypothesisIds stableId of each cause (rows[].stableId, e.g. H-001); [] unlinks all
   * @returns {void}
   * @throws {Error} if the experiment or a cause is unknown, or `hypothesisIds` is no array
   */
  setExperimentHypotheses(experimentId, hypothesisIds) {
    requireKnownId('experimentId', experimentId, this.model.experiments.map((x) => x.id));
    if (!Array.isArray(hypothesisIds)) {
      throw new Error(`invalid hypothesisIds ${JSON.stringify(hypothesisIds)}; allowed: an array of rows[].stableId`);
    }
    const known = this.model.rows.map((r) => r.stableId);
    for (const id of hypothesisIds) requireKnownId('hypothesisId', id, known);
    this.model.experiments.find((x) => x.id === experimentId).hypothesisIds = [...new Set(hypothesisIds)];
  }

  /**
   * @noagent view transform
   * @param {{hypothesisIds?: string[]}} x experiment
   * @returns {string} "2 linked" or the choose prompt
   */
  expLinkText(x) {
    const n = (x.hypothesisIds || []).length;
    return n > 0 ? `${n} ${this._t('linked')}` : this._t('chooseHypotheses');
  }

  /** @noagent template handler: a date input changed */
  expDatesChanged() { this._nextTick(() => { this.renderGantt(); this.renderCostChart('cumulative'); this.renderCostChart('rate'); }); }

  /** @noagent template handler: the status select changed */
  expStatusChanged() { this._nextTick(() => this.renderGantt()); }

  /**
   * Normalises typed costs (empty → null, "12,5" → 12.5) and redraws the cost charts.
   * @noagent template handler
   */
  expCostChanged() {
    this.model.experiments.forEach(x => {
      x.costMoney = this._normNum(x.costMoney);
      x.costHours = this._normNum(x.costHours);
    });
    this._nextTick(() => { this.renderCostChart('cumulative'); this.renderCostChart('rate'); });
  }

  /** @param {*} v @returns {number|null} */
  _normNum(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // ── Facts ─────────────────────────────────────────────────

  /**
   * Add an empty fact dated today, at the end.
   * @agent
   * @returns {number} id of the new fact
   */
  addFact() { return this.model.addFact().id; }

  /**
   * Set one field of a fact.
   * @agent
   * @param {number} factId the fact
   * @param {keyof FactFields} key which field
   * @param {string} value the new text; for date YYYY-MM-DD or ""
   * @returns {void}
   * @throws {Error} if the fact is unknown, `key` is no fact field or the value does not fit it
   */
  setFactField(factId, key, value) {
    requireKnownId('factId', factId, this.model.facts.map((f) => f.id));
    requireEnum('key', key, FACT_KEYS);
    const next = FACT_CHECKS[key](value);
    this.model.facts.find((f) => f.id === factId)[key] = next;
  }

  /**
   * Delete a fact, without asking.
   * @agent
   * @param {number} factId the fact
   * @returns {void}
   * @throws {Error} if the fact is unknown
   */
  deleteFact(factId) {
    requireKnownId('factId', factId, this.model.facts.map((f) => f.id));
    this.model.removeFact(factId);
  }

  /**
   * @noagent asks first; agents call deleteFact
   * @param {number} id fact id
   * @returns {Promise<void>}
   */
  async confirmDeleteFact(id) {
    const f = this.model.facts.find(x => x.id === id);
    if (!f) return;
    const label = (f.name && f.name.trim()) || `#${this.model.facts.indexOf(f) + 1}`;
    const ok = await this._context.dialog.confirm({
      message: this._t('delFactConfirm', { name: label }),
      title: this._context.i18n.t('common.delete'),
      confirmLabel: this._context.i18n.t('common.delete'),
      danger: true,
    });
    // The fact may have gone while the dialog was open (an agent call).
    if (!ok || !this.model.facts.some(x => x.id === id)) return;
    this.deleteFact(id);
  }

  /**
   * Move a fact directly before another one.
   * @agent
   * @param {number} factId the fact to move
   * @param {number} targetFactId the fact it goes before
   * @returns {void}
   * @throws {Error} if either fact is unknown
   */
  moveFactBefore(factId, targetFactId) {
    const ids = this.model.facts.map((f) => f.id);
    requireKnownId('factId', factId, ids);
    requireKnownId('targetFactId', targetFactId, ids);
    this.model.moveFactBefore(factId, targetFactId);
  }

  /** @noagent view transform @returns {string[]} expert names for the owner/responsible suggestions */
  ownerNames() { return this.model.experts.map(e => e.name).filter(Boolean); }

  // ── Link forms (borrowed from the template) ──────

  /**
   * Opens the form that links experiments to one cause.
   * @noagent form; agents call setExperimentHypotheses
   * @param {number} rowId cause row id
   */
  openExpLink(rowId) {
    const row = this.model.rows.find(r => r.id === rowId);
    if (!row || !row.stableId) return;
    const sid = row.stableId;
    this.expLinkDraft = {
      hint: this._t('chooseExperimentsHint', { name: this.model.dName(row) }),
      items: this.model.experiments.map((x, idx) => {
        const status = x.status || 'planned';
        return {
          xId: x.id,
          num: idx + 1,
          label: (x.title && x.title.trim()) || `${this._t('experiment')} #${idx + 1}`,
          dateRange: (x.startDate || x.endDate) ? `${x.startDate || '?'} → ${x.endDate || '?'}` : '',
          status,
          statusLabel: this._t(`expStatus.${status}`),
          checked: Array.isArray(x.hypothesisIds) && x.hypothesisIds.includes(sid),
        };
      }),
    };
    this._context.dialog.form({
      title: this._t('linkExperimentsTitle'),
      content: this._ref('expLinkForm'),
      confirmLabel: this._context.i18n.t('common.save'),
      onConfirm: () => {
        this.expLinkDraft.items.forEach(it => {
          const exp = this.model.experiments.find(x => x.id === it.xId);
          if (!exp) return;
          if (!Array.isArray(exp.hypothesisIds)) exp.hypothesisIds = [];
          const has = exp.hypothesisIds.includes(sid);
          if (it.checked && !has) exp.hypothesisIds.push(sid);
          else if (!it.checked && has) exp.hypothesisIds = exp.hypothesisIds.filter(s => s !== sid);
        });
      },
    });
  }

  /**
   * Opens the form that chooses the causes of one experiment.
   * @noagent form; agents call setExperimentHypotheses
   * @param {number} expId experiment id
   */
  openHypLink(expId) {
    const experiment = this.model.experiments.find(x => x.id === expId);
    if (!experiment) return;
    const ord = this.model.ordered();
    const nums = this.model.buildNums();
    const linked = new Set(experiment.hypothesisIds || []);
    this.hypLinkDraft = {
      items: ord.map(r => {
        const ec = this.model.effCat(r);
        return {
          stableId: r.stableId,
          num: nums[r.id] || '',
          cat: Boolean(ec),
          catColor: ec ? catColor(ec) : '',
          catLabel: ec ? catLabel(this.model, ec, this._t) : '',
          name: this.model.dName(r),
          checked: linked.has(r.stableId),
        };
      }),
    };
    this._context.dialog.form({
      title: this._t('chooseHypotheses'),
      content: this._ref('hypLinkForm'),
      confirmLabel: this._context.i18n.t('common.save'),
      onConfirm: () => {
        this.setExperimentHypotheses(expId, this.hypLinkDraft.items.filter(it => it.checked).map(it => it.stableId));
      },
    });
  }

  // ── Gantt chart (chartManager) ────────────────────────────

  _destroyGantt() {
    if (this._ganttChart) {
      try { this._context.chartManager.destroy(this._ganttChart); } catch { /* ignore */ }
      this._ganttChart = null;
    }
  }

  /**
   * @noagent chart
   * @returns {Promise<void>}
   */
  async renderGantt() {
    const host = this._container()?.querySelector('[data-ref="ganttCanvas"]');
    if (!host) return;
    this._destroyGantt();
    const lang = this._context.language || 'de';
    const config = computeGanttConfig(this.model.experiments, { now: Date.now(), lang });
    if (config.isEmpty) { host.style.height = ''; host.replaceChildren(); this.ganttEmptyMsg = this._t('ganttNoData'); return; }
    this.ganttEmptyMsg = '';
    host.replaceChildren();
    // The chart framework sizes its SVG to the host via a height:100% chain +
    // ResizeObserver — the host MUST carry a definite height or the measured
    // height drifts on every re-render. Pin it to padT + rows·rowH + padB.
    const gl = config.layout;
    host.style.height = `${gl.padT + config.tasks.length * gl.rowH + gl.padB}px`;
    const gen = ++this._ganttGen;
    const chart = await this._context.chartManager.create(host, 'gantt', { ...config, todayLabel: this._t('today') });
    if (gen !== this._ganttGen) { this._context.chartManager.destroy(chart); return; }
    this._ganttChart = chart;
  }

  // ── Cost chart (chartManager — dual-axis cumulative-cost type) ──

  _destroyCostCharts() {
    ['_costCumChart', '_costRateChart'].forEach((key) => {
      if (this[key]) {
        try { this._context.chartManager.destroy(this[key]); } catch { /* ignore */ }
        this[key] = null;
      }
    });
  }

  /**
   * @noagent chart
   * @param {'cumulative'|'rate'} [mode]
   * @returns {Promise<void>}
   */
  async renderCostChart(mode = 'cumulative') {
    const hostRef = mode === 'rate' ? 'costRateChartCanvas' : 'costChartCanvas';
    const host = this._container()?.querySelector(`[data-ref="${hostRef}"]`);
    if (!host) return;
    const handleKey = mode === 'rate' ? '_costRateChart' : '_costCumChart';
    const emptyField = mode === 'rate' ? 'costRateEmptyMsg' : 'costEmptyMsg';
    // Tear down only this mode's prior instance.
    if (this[handleKey]) {
      try { this._context.chartManager.destroy(this[handleKey]); } catch { /* ignore */ }
      this[handleKey] = null;
    }
    const lang = this._context.language || 'de';
    const config = computeCostConfig(this.model.experiments, mode, { now: Date.now(), lang });
    if (config.isEmpty) { host.style.height = ''; host.replaceChildren(); this[emptyField] = this._t('costChartNoData'); return; }
    this[emptyField] = '';
    host.replaceChildren();
    // Pin a definite host height (padT + innerH + padB) — see renderGantt.
    const cl = config.layout;
    host.style.height = `${cl.padT + cl.innerH + cl.padB}px`;
    const genKey = mode === 'rate' ? 'rate' : 'cumulative';
    const gen = ++this._costGen[genKey];
    const chart = await this._context.chartManager.create(host, 'cumulative-cost', {
      ...config,
      moneyLabel: this._t('costMoney'),
      hoursLabel: this._t('costHours'),
    });
    if (gen !== this._costGen[genKey]) { this._context.chartManager.destroy(chart); return; }
    this[handleKey] = chart;
  }
}
