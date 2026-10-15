/**
 * D.Mike — MSA Typ 1 Module (msa-typ1.js)
 * Measure phase: Measurement System Analysis Type 1.
 * Evaluates gage repeatability (Cg) and bias (Cgk).
 *
 * Data source: column from a Worksheet module (referenced by column ID).
 *
 * Migrated to createModule + Alpine CSP. The Model (msa-typ1-model.js) holds
 * only the raw inputs; the analysis result is derived transiently in the view
 * from those inputs plus the live worksheet column values. ColumnPicker and the
 * SVG charts are mounted imperatively (they are not pure-template concerns).
 *
 * Spec: docs/modules/MSA-TYP1.md
 *
 * @agent  Steuerbar über das Viewmodel: die sieben Parameter (setParam), die
 *   Messwertspalte (setColumn) und das Rechnen selbst. Gelesen wird über
 *   read() mit erklärter Lesefläche (AgentRead) — Konfiguration, wählbare
 *   Mengen und gerechnetes Ergebnis. Der Agent bekommt Zahlen, keine
 *   Diagramme.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireText } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { State } from './msa-typ1-model.js';
import { validate, analyze } from '../../engines/msa-typ1-engine.js';
import { ColumnPicker, getColumnValues, refToKey, keyToRef } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';

/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 4) { return v.toFixed(d); }

/** @param {number|null} v @param {number} d @returns {string} */
function fmtOpt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : '–'; }

/** @param {number|null} p @returns {string} */
function fmtP(p) {
  if (!Number.isFinite(p)) return '–';
  return p < 0.001 ? '< 0.001' : `= ${p.toFixed(3)}`;
}

/** Die sieben Parameter, die `setParam` annimmt (Reihenfolge wie im Model). */
const PARAM_KEYS = ['name', 'ref', 'unit', 'lsl', 'usl', 'k1', 'k2'];

/** Die Werte der beiden Auswahllisten (k₁ Anteil der Toleranz, k₂ Streuungsfaktor). */
const K1_OPTIONS = ['0.2', '0.15', '0.1'];
const K2_OPTIONS = ['3', '4', '6'];

/** Je Parameter sein Prüfer; freie Texte nehmen nur eine Zeichenkette an. */
const PARAM_CHECKS = {
  name: (v) => requireText('value', v),
  ref: (v) => requireText('value', v),
  unit: (v) => requireText('value', v),
  lsl: (v) => requireText('value', v),
  usl: (v) => requireText('value', v),
  k1: (v) => requireEnum('value', v, K1_OPTIONS),
  k2: (v) => requireEnum('value', v, K2_OPTIONS),
};

/** Die Spalten-Slots dieses Moduls: genau einer, die Messwertspalte. */
const COLUMN_SLOTS = ['value'];

/** Je Slot der Filter, den der Wähler dieses Slots bekommt (Typ `'numeric'`). */
const SLOT_FILTERS = { value: { types: ['numeric'] } };

/** Je Slot die eine Zuweisungsstelle seines Model-Feldes. */
const COLUMN_SINKS = { value: (m, ref) => { m.columnRef = ref; } };

/**
 * Die Agenten-Lesefläche von MSA Typ 1.
 *
 * Nicht die persistierte Form: das Model hält NUR die Eingaben, das Ergebnis
 * entsteht transient am Viewmodel (`result`). Darum erklärt dieses Modul seine
 * Lesefläche: Konfiguration, die zwei abgeleiteten Mengen, die `setParam` und
 * `setColumn` prüfen, und das Ergebnis — ohne die interne
 * Beispiel-Buchführung (`exampleWorksheetId`).
 *
 * @typedef {object} AgentRead
 * @property {object} params  the entered parameters (name, ref, unit, lsl, usl, k1, k2), values as text as entered
 * @property {object|null} columnRef  the chosen measurement column, `{ instanceId, sheetId, columnId }`, or null
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts in the current state
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {object|null} result  the computed result, or null while the inputs are incomplete
 */
const mod = createModule({
  config: {
    id: 'msa-typ1',
    engine: 'alpine',
    phase: 'measure',
    icon: 'module.msa-typ1',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      result: null,
      errorMsg: '',
      _picker: null,
      _charts: [],
      _unsubs: [],
      _debTimer: null,
      _renderGen: 0,

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Konfiguration, wählbare Mengen und gerechnetes Ergebnis
       */
      read(options) {
        return readAgentState('msa-typ1', {
          ...this.model.toJSON(),
          activeParams: this.activeParams(),
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          result: this.result,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() { return [...PARAM_KEYS]; },

      /** @noagent view transform; die Optionen des k1-Auswahlfeldes (eine Quelle: K1_OPTIONS) */
      k1Options() {
        return K1_OPTIONS.map(v => ({ value: v, label: `${Number(v).toFixed(2)} (${Math.round(Number(v) * 100)} %)` }));
      },
      /** @noagent view transform; die Optionen des k2-Auswahlfeldes (eine Quelle: K2_OPTIONS) */
      k2Options() { return K2_OPTIONS.map(v => ({ value: v, label: _t(`k2Opt${v}`) })); },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(COLUMN_SLOTS.map(slot =>
          [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /**
       * Einen Parameter setzen.
       * @agent
       * @param {'name'|'ref'|'unit'|'lsl'|'usl'|'k1'|'k2'} key welcher Parameter
       * @param {string} value der Wert als Text, wie er eingegeben würde
       * @returns {void}
       * @throws {Error} wenn `key` kein Parameter dieses Moduls ist
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        PARAM_CHECKS[key](value);
        this.model.params[key] = value;
        this.scheduleAnalysis();
      },

      /**
       * Eine Spalte einem Slot zuweisen.
       * @agent
       * @param {'value'} slot der Slot; dieses Modul führt nur `value`
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        if (ref == null) {
          COLUMN_SINKS[slot](this.model, null);
          this._picker?.syncValue(null);
          this.scheduleAnalysis();
          return;
        }
        requireEnum('slot', slot, this.activeColumnSlots());
        const keys = this.pickableColumns()[slot].map(c => c.key);
        requireKnownId('ref', refToKey(ref), keys);
        // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
        const clean = keyToRef(refToKey(ref));
        COLUMN_SINKS[slot](this.model, clean);
        this._picker?.syncValue(clean);
        this.scheduleAnalysis();
      },

      // ── View transformations ──────────────────────────────────

      /** @noagent view transform */
      fmt,
      /** @noagent view transform */
      fmtOpt,
      /** @noagent view transform */
      fmtP,
      /** @noagent view transform */
      abs: (v) => Math.abs(v),

      /** @noagent view transform */
      statusLabel(r) {
        if (r?.noSpread) return _t('statusNoSpread');
        return _t({ pass: 'statusPass', fail: 'statusFail', warn: 'statusWarn', none: 'statusOneSided' }[r?.overall] || 'statusWarn');
      },
      /** @noagent view transform */
      badgeLabel: (s) => (s == null ? '–' : _t({ pass: 'capable', fail: 'notCapable', warn: 'condCapable' }[s] || 'condCapable')),
      /** @noagent view transform */
      kpiModClass: (s) => ({ pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' }[s] || ''),

      /** @noagent view transform */
      featureName() { return this.model.params.name || '–'; },

      /** @noagent view transform @returns {boolean} true when the analysis ran in two-sided tolerance mode. */
      isTwoSided() { return this.result?.mode === 'two-sided'; },

      /** @noagent view transform @returns {string} formatted bias one-sample t-test line (always available, both modes). */
      biasTestText() {
        const bt = this.result?.biasTest;
        if (!bt || bt.t == null) return '–';
        const sig = bt.p < 0.05 ? _t('biasSignificant') : _t('biasNotSignificant');
        const line = _t('biasTestLine', { t: bt.t.toFixed(2), df: bt.df, p: fmtP(bt.p) });
        return `${line} · ${sig}`;
      },

      /** @noagent view transform; Horizontal stats table columns (label/value pairs). */
      statCols() {
        const r = this.result;
        if (!r) return [];
        const u = this.model.params.unit || '';
        return [
          { label: _t('statN'), value: String(r.n) },
          { label: _t('statMean'), value: `${fmt(r.xbar)} ${u}` },
          { label: _t('statStddev'), value: `${fmt(r.sg)} ${u}` },
          { label: _t('statMin'), value: `${fmt(r.xmin)} ${u}` },
          { label: _t('statMax'), value: `${fmt(r.xmax)} ${u}` },
          { label: _t('statRange'), value: `${fmt(r.range)} ${u}` },
          { label: _t('statRef'), value: `${fmt(r.params.ref)} ${u}` },
          { label: _t('statTol'), value: `${fmtOpt(r.T)} ${u}` },
          { label: _t('statResolution'), value: r.resolution > 0 ? (r.resPercent == null ? `${fmt(r.resolution)} ${u}` : `${fmt(r.resolution)} ${u} (${fmt(r.resPercent)} % T)`) : '–' },
          { label: 'k₁ / k₂', value: `${r.params.k1} / ${r.params.k2}` },
        ];
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      /** @noagent helper; Zahlenlesen der Rechnung */
      parseNum(s) {
        if (s == null || s === '') return NaN;
        return parseFloat(String(s).replace(',', '.').trim());
      },

      /** @noagent helper; liest die Spaltenwerte der Rechnung */
      getColumnValues() {
        if (!this.model.columnRef) return [];
        return getColumnValues(module._context.stateManager, this.model.columnRef)
          .filter(v => v != null && typeof v === 'number' && !isNaN(v));
      },

      /**
       * Rechnet mit den aktuellen Eingaben. Unvollständige Eingaben lassen
       * result auf null (keine Absage, wie die Oberfläche).
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        if (!this.model.columnRef) return this.clearResults();
        const values = this.getColumnValues();
        if (values.length === 0) return this.clearResults();

        const p = this.model.params;
        const ref = this.parseNum(p.ref);
        const lsl = this.parseNum(p.lsl);
        const usl = this.parseNum(p.usl);

        const validation = validate({ ref, lsl, usl }, values);
        if (!validation.valid) return this.clearResults();

        const k1 = parseFloat(p.k1);
        const k2 = parseFloat(p.k2);
        const r = analyze({ ref, lsl, usl, k1, k2 }, values);
        this.result = r;
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderCharts(r, gen));
      },

      /**
       * Die Rechnung nach kurzer Ruhezeit anstoßen.
       * @agent
       * @returns {void}
       */
      scheduleAnalysis() {
        clearTimeout(this._debTimer);
        this._debTimer = setTimeout(() => this.runAnalysis(), 600);
      },

      /**
       * Das Ergebnis und die Diagramme verwerfen.
       * @agent
       * @returns {void}
       */
      clearResults() {
        this.result = null;
        this._destroyCharts();
      },

      // ── SVG charts (imperative via chartManager) ──────────────

      async _renderCharts(r, gen) {
        this._destroyCharts();
        const runEl = module._container.querySelector('[data-ref="chart-run"]');
        const histEl = module._container.querySelector('[data-ref="chart-hist"]');
        if (!runEl || !histEl) return;
        const values = r.details.map(d => d.value);
        await this._renderRunChart(runEl, r, values, gen);
        if (gen !== this._renderGen) return;
        await this._renderHistogram(histEl, r, values, gen);
      },

      async _renderRunChart(el, r, values, gen) {
        el.replaceChildren();
        const indices = values.map((_, i) => i + 1);
        const outIdx = [], outVal = [];
        r.details.forEach(d => { if (d.isOutlier) { outIdx.push(d.index); outVal.push(d.value); } });

        const refLines = [
          { dir: 'h', value: r.params.ref, label: 'Ref', dash: 'dash', width: 1.5, color: 'var(--color-success)' },
          { dir: 'h', value: r.xbar, label: 'x̄', dash: 'dot', width: 1, color: 'var(--color-info)' },
        ];
        if (Number.isFinite(r.params.usl)) refLines.push({ dir: 'h', value: r.params.usl, label: 'USL', dash: 'dash', width: 1, color: 'var(--color-error)' });
        if (Number.isFinite(r.params.lsl)) refLines.push({ dir: 'h', value: r.params.lsl, label: 'LSL', dash: 'dash', width: 1, color: 'var(--color-error)' });

        const refAreas = r.zoneLo != null
          ? [{ dir: 'y', min: r.zoneLo, max: r.zoneHi, label: 'k₁·T', color: 'rgba(52,199,89,0.06)' }]
          : [];

        const chart = await module._context.chartManager.create(el, 'scatter', {
          xLabel: _t('chartIndex'),
          showLegend: true,
          markerSize: 5,
          series: [
            { name: _t('chartValues'), color: 'var(--color-accent)',
              x: indices, y: values,
              connectLine: { show: true, color: 'var(--color-text-secondary)', width: 1.5, dash: 'solid' } },
            ...(outIdx.length > 0 ? [{
              name: _t('chartOutliers'), color: 'var(--color-error)',
              stroke: 'var(--color-error)', strokeWidth: 2,
              x: outIdx, y: outVal, symbol: 'circle',
            }] : []),
          ],
          refLines,
          refAreas,
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      async _renderHistogram(el, r, values, gen) {
        el.replaceChildren();
        const refLines = [];
        if (Number.isFinite(r.params.lsl)) refLines.push({ dir: 'v', value: r.params.lsl, label: 'LSL', color: 'var(--color-error)', dash: 'dash', width: 1.5, showLabel: true });
        if (Number.isFinite(r.params.usl)) refLines.push({ dir: 'v', value: r.params.usl, label: 'USL', color: 'var(--color-error)', dash: 'dash', width: 1.5, showLabel: true });
        if (Number.isFinite(r.params.ref)) refLines.push({ dir: 'v', value: r.params.ref, label: 'Target', color: 'var(--color-success)', dash: 'dash', width: 1.5, showLabel: true });

        const chart = await module._context.chartManager.create(el, 'histogram', {
          data: values,
          binMethod: 'sturges',
          showNormalCurve: true,
          barColor: 'var(--color-accent)',
          normalCurveColor: 'var(--color-info)',
          showLegend: true,
          refLines,
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      _destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── Algorithm Lab link ────────────────────────────────────

      /** @noagent navigation */
      algoNavigate(algoId, event) {
        event?.stopPropagation();
        if (algoId && module._context.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      },

      // ── ColumnPicker (imperative widget) ──────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="col-picker-wrap"]');
        if (!wrap) return;
        this._picker?.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          ...SLOT_FILTERS.value,
          onChange: (ref) => {
            this.setColumn('value', ref);
            this.runAnalysis();
          },
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      /** @noagent lifecycle */
      init() {
        // Fresh per-instance collections (the data() object is shared by Alpine.data).
        this._charts = [];
        this._unsubs = [];

        this._mountPicker();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) this._picker?.refresh();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        const onTheme = () => {
          if (this.result) this._renderCharts(this.result, ++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Recompute results from restored state.
        this.runAnalysis();
      },

      /** @noagent lifecycle */
      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        clearTimeout(this._debTimer);
        this._picker?.destroy();
        this._picker = null;
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: MSA-Typ1 examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRef.instanceId`. On load we provision a fresh worksheet, rewrite the
 * placeholder, then apply state (which re-runs the analysis on the new data).
 *
 * This replaces the generic createModule loadExample because of the worksheet
 * provisioning the generic helper cannot perform.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      if (data.columnRef && data.columnRef.instanceId === '__source__') {
        return { ...data, columnRef: { ...data.columnRef, instanceId } };
      }
      return data;
    },
  });
};

export default mod;
