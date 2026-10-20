/**
 * D.Mike — Attribute Test Module (attribute-test.js)
 *
 * 1/2-proportion, equivalence (TOST), McNemar, 1/2 Poisson-rate and chi-square
 * association tests on counts, entered as summarized counts or taken from
 * worksheet columns.
 * Pipeline: state → normalizer → engine (via report) → template.
 * @see docs/superpowers/specs/2026-10-10-attribute-tests-design.md
 */

import { createModule } from '../../core/template-module.js';
import { ColumnPicker } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';
import { State } from './attribute-test-model.js';
import {
  normalizeSummary, normalizeColumns, distinctValues, defaultEventValue, columnValuesOrNull,
} from './attribute-test-input.js';
import { buildReport } from './attribute-test-report.js';

const PICKERS = [
  { role: 'response', wrap: 'picker-response-wrap' },
  { role: 'group', wrap: 'picker-group-wrap' },
  { role: 'rowVar', wrap: 'picker-row-wrap' },
  { role: 'colVar', wrap: 'picker-col-wrap' },
  { role: 'counts', wrap: 'picker-counts-wrap' },
  { role: 'before', wrap: 'picker-before-wrap' },
  { role: 'after', wrap: 'picker-after-wrap' },
];

const mod = createModule({
  config: {
    id: 'attribute-test',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.attribute-test',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ────────────────────
      result: null,
      eventOptions: [],
      _pickers: {},
      _unsubs: [],

      // ── Template helpers (no ?. in the template) ───────────────
      isKind(k) { return this.model.testKind === k; },
      isMode(m) { return this.model.inputMode === m; },
      hasResult() { return !!(this.result && !this.result.error); },
      message() { return this.result && this.result.error ? _t(this.result.error) : ''; },
      isHint() { return !!(this.result && this.result.hint); },
      stats() { return this.hasResult() ? this.result.stats : []; },
      notes() { return this.hasResult() ? this.result.notes : []; },
      statLabel(s) { return _t(s.labelKey, s.params || {}); },
      noteText(n) { return _t(n.key, n.params || {}); },
      hasTable() { return this.hasResult() && !!this.result.table; },
      tableCols() { return this.hasTable() ? this.result.table.cols : []; },
      tableRows() { return this.hasTable() ? this.result.table.rows : []; },
      actions() { return this.hasResult() ? (this.result.actions || []) : []; },
      decisionText() {
        if (!this.hasResult()) return '';
        if (this.model.testKind === 'equiv') {
          const d = this.result.decision === 'equivalent' ? 'decisionEquivalent' : 'decisionNotEquivalent';
          return _t(d, { ...(this.result.decisionParams || {}), alpha: this.model.alpha });
        }
        return _t(this.result.decision === 'reject' ? 'decisionReject' : 'decisionKeep',
          { alpha: this.model.alpha });
      },
      decisionClass() {
        if (!this.hasResult()) return 'attrtest__decision--keep';
        const d = this.result.decision;
        if (d === 'notEquivalent') return '';
        return d === 'reject' ? 'attrtest__decision--reject' : 'attrtest__decision--keep';
      },
      basisText() { return this.hasResult() ? _t(this.result.basisKey) : ''; },
      hypotheses() {
        const d = this.model.direction;
        const op = d === 'two-sided' ? '≠' : d === 'greater' ? '>' : '<';
        const k = this.model.testKind;
        if (k === 'one') return [_t('h0One'), _t('h1One', { op })];
        if (k === 'two') return [_t('h0Two'), _t('h1Two', { op })];
        if (k === 'rate1') return [_t('h0Rate1'), _t('h1Rate1', { op })];
        if (k === 'rate2') return [_t('h0Rate2'), _t('h1Rate2', { op })];
        if (k === 'mcnemar') return [_t('h0McNemar'), _t('h1McNemar', { op })];
        if (k === 'equiv') return [_t('h0Equiv'), _t('h1Equiv')];
        return [_t('h0Assoc'), _t('h1Assoc')];
      },
      is2x2() {
        return this.hasTable() && this.tableCols().length === 2 && this.tableRows().length === 2;
      },
      showDirection() {
        if (this.isKind('equiv')) return false;
        return !this.isKind('assoc') || this.is2x2();
      },
      isSamples(n) { return this.model.equiv.samples === n; },
      // Kinds that reuse the 1-/2-proportion inputs (equivalence follows its sample switch)
      oneSample() { return this.isKind('one') || (this.isKind('equiv') && this.isSamples(1)); },
      twoSample() { return this.isKind('two') || (this.isKind('equiv') && this.isSamples(2)); },
      usesResponse() { return this.oneSample() || this.twoSample(); },
      usesGroup() { return this.twoSample() || this.isKind('rate2'); },
      usesCounts() { return this.isKind('rate1') || this.isKind('rate2'); },
      usesExposurePerRow() { return this.usesCounts(); },
      pairValue(i, j) { return this.model.summary.pairs.counts[i][j]; },
      cellValue(i, j) { return this.model.summary.table.counts[i][j]; },
      tableRowIdx() { return this.model.summary.table.rows.map((_, i) => i); },
      tableColIdx() { return this.model.summary.table.cols.map((_, j) => j); },
      rowName(i) { return this.model.summary.table.rows[i]; },
      colName(j) { return this.model.summary.table.cols[j]; },
      showEvent() { return this.isMode('columns') && (this.usesResponse() || this.isKind('mcnemar')); },
      isEvent(v) { return v === this.model.eventValue; },

      // ── Input handlers ─────────────────────────────────────────
      setKind(k) {
        this.model.testKind = k;
        this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });
      },
      setMode(m) {
        this.model.inputMode = m;
        this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });
      },
      setEquivSamples(n) { this.model.equiv.samples = n; this.$nextTick(() => this._remountPickers()); },
      setBoundsSymmetric(on) { this.model.equiv.symmetric = on; },
      setPair(i, j, event) { this.model.summary.pairs.counts[i][j] = event.target.value; },
      /**
       * Run a result action. `actionCheckEquivalence` carries the 2-proportion
       * counts over to the equivalence test.
       * @param {string} key
       */
      runAction(key) {
        if (key !== 'actionCheckEquivalence') return;
        this.model.switchToEquivalence();
        this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });
      },
      onAlphaInput(event) {
        const v = parseFloat(String(event.target.value).replace(',', '.'));
        if (Number.isFinite(v) && v > 0 && v < 1) this.model.alpha = v;
        else event.target.value = this.model.alpha; // invalid: re-sync the field to the active α
      },
      setCell(i, j, event) { this.model.summary.table.counts[i][j] = event.target.value; },
      setRowName(i, event) { this.model.summary.table.rows[i] = event.target.value; },
      setColName(j, event) { this.model.summary.table.cols[j] = event.target.value; },
      addRow() { this.model.addRow(); },
      addCol() { this.model.addCol(); },
      removeRow(i) { this.model.removeRow(i); },
      removeCol(j) { this.model.removeCol(j); },
      onEventChange(event) { this.model.eventValue = event.target.value; },

      // ── Analysis ───────────────────────────────────────────────
      _values(ref) {
        return columnValuesOrNull(module._context.stateManager, ref);
      },
      runAnalysis() {
        const m = this.model;
        if (m.alpha == null) this._seedAlpha();
        if (m.inputMode === 'columns') {
          const cols = {
            response: this._values(m.colRefs.response),
            group: this._values(m.colRefs.group),
            rowVar: this._values(m.colRefs.rowVar),
            colVar: this._values(m.colRefs.colVar),
            counts: this._values(m.colRefs.counts),
            before: this._values(m.colRefs.before),
            after: this._values(m.colRefs.after),
          };
          // McNemar's event candidates come from both paired columns together
          const eventSource = m.testKind === 'mcnemar'
            ? (cols.before && cols.after ? [...cols.before, ...cols.after] : null)
            : cols.response;
          this.eventOptions = eventSource ? distinctValues(eventSource) : [];
          if (this.eventOptions.length && !this.eventOptions.includes(m.eventValue)) {
            m.eventValue = defaultEventValue(eventSource);
          }
          this.result = buildReport(m, normalizeColumns(m, cols));
        } else {
          this.result = buildReport(m, normalizeSummary(m));
        }
      },

      // ── ColumnPickers (imperative widgets) ─────────────────────
      _remountPickers() {
        this._disposePickers();
        const ctx = module._context;
        const c = module._container;
        for (const { role, wrap } of PICKERS) {
          const el = c.querySelector(`[data-ref="${wrap}"]`);
          if (!el) continue;
          const picker = new ColumnPicker(el, ctx, {
            mode: 'single',
            minCount: 2,
            onChange: (ref) => { this.model.colRefs[role] = ref; },
          });
          if (this.model.colRefs[role]) picker.value = this.model.colRefs[role];
          this._pickers[role] = picker;
        }
      },
      _disposePickers() {
        for (const p of Object.values(this._pickers)) p.destroy();
        this._pickers = {};
      },

      // ── Lifecycle ──────────────────────────────────────────────
      _seedAlpha() {
        const sm = module._context.stateManager;
        const globalConf = (sm.get('settings.confidenceLevel') ?? 95) / 100;
        this.model.alpha = Number((1 - globalConf).toFixed(4));
      },
      init() {
        this._unsubs = [];
        if (this.model.alpha == null) this._seedAlpha();

        // Every change of the persisted state re-runs the analysis. runAnalysis
        // only writes `eventValue` when it changes, so this settles in one pass.
        this.$watch(() => this.model.toJSON(), () => this.runAnalysis());

        this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId !== module._context.instanceId) return;
          for (const p of Object.values(this._pickers)) p.refresh();
          this.runAnalysis();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        this.runAnalysis();
      },
      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._disposePickers();
      },
    };
  },
});

/**
 * Custom loadExample: column examples ship a worksheet and use the
 * placeholder `__source__` as `instanceId` in `colRefs`. Summary examples
 * carry no worksheet and are applied as plain state.
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      const rewrite = (r) => (r && r.instanceId === '__source__' ? { ...r, instanceId } : r);
      const refs = data.colRefs || {};
      return {
        ...data,
        colRefs: Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, rewrite(r)])),
      };
    },
  });
};

export default mod;
