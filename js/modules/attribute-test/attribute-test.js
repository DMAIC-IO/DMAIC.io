/**
 * D.Mike — Attribute Test Module (attribute-test.js)
 *
 * 1-proportion, 2-proportion and chi-square association tests on counts,
 * entered as summarized counts or taken from worksheet columns.
 * Pipeline: state → normalizer → engine (via report) → template.
 * @see docs/superpowers/specs/2026-10-10-attribute-tests-design.md
 */

import { createModule } from '../../core/template-module.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';
import { State } from './attribute-test-model.js';
import {
  normalizeSummary, normalizeColumns, distinctValues, defaultEventValue,
} from './attribute-test-input.js';
import { buildReport } from './attribute-test-report.js';

const PICKERS = [
  { role: 'response', wrap: 'picker-response-wrap' },
  { role: 'group', wrap: 'picker-group-wrap' },
  { role: 'rowVar', wrap: 'picker-row-wrap' },
  { role: 'colVar', wrap: 'picker-col-wrap' },
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
      decisionText() {
        if (!this.hasResult()) return '';
        return _t(this.result.decision === 'reject' ? 'decisionReject' : 'decisionKeep',
          { alpha: this.model.alpha });
      },
      decisionClass() {
        return this.hasResult() && this.result.decision === 'reject'
          ? 'attrtest__decision--reject' : 'attrtest__decision--keep';
      },
      basisText() { return this.hasResult() ? _t(this.result.basisKey) : ''; },
      hypotheses() {
        const d = this.model.direction;
        const op = d === 'two-sided' ? '≠' : d === 'greater' ? '>' : '<';
        if (this.model.testKind === 'one') return [_t('h0One'), _t('h1One', { op })];
        if (this.model.testKind === 'two') return [_t('h0Two'), _t('h1Two', { op })];
        return [_t('h0Assoc'), _t('h1Assoc')];
      },
      is2x2() {
        return this.hasTable() && this.tableCols().length === 2 && this.tableRows().length === 2;
      },
      showDirection() { return !this.isKind('assoc') || this.is2x2(); },
      cellValue(i, j) { return this.model.summary.table.counts[i][j]; },
      tableRowIdx() { return this.model.summary.table.rows.map((_, i) => i); },
      tableColIdx() { return this.model.summary.table.cols.map((_, j) => j); },
      rowName(i) { return this.model.summary.table.rows[i]; },
      colName(j) { return this.model.summary.table.cols[j]; },
      showEvent() { return this.isMode('columns') && !this.isKind('assoc'); },
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
      onAlphaInput(event) {
        const v = parseFloat(String(event.target.value).replace(',', '.'));
        if (Number.isFinite(v) && v > 0 && v < 1) this.model.alpha = v;
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
        return ref ? getColumnValues(module._context.stateManager, ref) : null;
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
          };
          this.eventOptions = cols.response ? distinctValues(cols.response) : [];
          if (this.eventOptions.length && !this.eventOptions.includes(m.eventValue)) {
            m.eventValue = defaultEventValue(cols.response);
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
