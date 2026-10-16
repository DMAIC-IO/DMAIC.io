/**
 * D.Mike — Process Capability Module (process-capability.js)
 * Measure phase: Process Capability Analysis (Cp, Cpk, Pp, Ppk).
 * Supports two-sided (LSL + USL) and one-sided specifications.
 *
 * Data source: column from a Worksheet module (referenced by column ID), or
 * values embedded directly from a catalog example.
 *
 * Migrated to createModule + Alpine CSP. The Model (process-capability-model.js)
 * holds only the raw inputs / column reference / embedded values; the analysis
 * RESULT is derived transiently in the view from those inputs plus the live
 * worksheet data via the (unchanged) capability engine.
 *
 * @agent  Steuerbar über das Viewmodel: die elf Parameter (setParam), die
 *   Messwertspalte und die Untergruppenspalte (setColumn), das Verwerfen
 *   eingebetteter Beispieldaten (clearEmbedded) und das Rechnen selbst. Gelesen
 *   wird über read() mit erklärter Lesefläche (AgentRead) — Konfiguration,
 *   wählbare Mengen, Schätzerhinweis und gerechnetes Ergebnis. Der Agent bekommt
 *   Zahlen, keine Diagramme.
 *
 * Imperative widgets (mounted in init(), disposed in destroy()):
 *   - the shared ColumnPicker in 'select' mode (worksheet-column <select>);
 *     the embedded-example "remove" pill is rendered declaratively in the
 *     Alpine template (x-if model.embeddedValues)
 *   - the capability histogram (chartManager)
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireNumber, requireText } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { State, SUBGROUP_MODES } from './process-capability-model.js';
import { validate, analyze } from '../../engines/process-capability-engine.js';
import {
  splitSubgroups, alignValuesAndIds, validMethods, defaultMethod, SigmaWithinError,
  SUBGROUP_METHODS,
} from '../../engines/sigma-within-engine.js';
import { ColumnPicker, getColumnValues, discoverColumns, refToKey, keyToRef } from '../../ui/column-picker.js';
import { fmt, fmtZ, fmtFraction } from './process-capability-format.js';

/** Auto-run debounce (ms) — matches the legacy behaviour. */
const AUTORUN_DELAY = 600;

/** n̄ with at most two decimals. */
function fmtNBar(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** Die zwei Wahrheitswerte, die `unbiased` annimmt (kein Umwandeln: `'nein'` wäre sonst wahr). */
const BOOL_VALUES = [true, false];

/** Die elf Parameter, die `setParam` annimmt (Reihenfolge der Oberfläche). */
const PARAM_KEYS = ['name', 'lsl', 'target', 'usl', 'unit', 'confidence',
  'subgroupMode', 'subgroupSize', 'withinMethod', 'mrSpan', 'unbiased'];

/** Zulässige Bereiche der Ganzzahlfelder: eine Quelle für Prüfer und Eingabe. */
const PARAM_RANGES = {
  subgroupSize: { min: 1, integer: true },
  mrSpan: { min: 2, max: 100, integer: true },
};

/**
 * Je Parameter sein Prüfer; er gibt den Wert zurück, den das Model ablegt.
 * `subgroupSize` und `mrSpan` hält das Model als Text (wie die Eingabe), der
 * Prüfer nimmt Zahl oder Zahlentext und legt den Text ab.
 */
const PARAM_CHECKS = {
  name: (v) => requireText('value', v),
  lsl: (v) => requireText('value', v),
  target: (v) => requireText('value', v),
  usl: (v) => requireText('value', v),
  unit: (v) => requireText('value', v),
  confidence: (v) => requireText('value', v),
  subgroupMode: (v) => { requireEnum('value', v, SUBGROUP_MODES); return v; },
  subgroupSize: (v) => String(requireNumber('value', v, PARAM_RANGES.subgroupSize)),
  withinMethod: (v) => v, // gegen withinMethodOptions() in setParam geprüft: die Menge hängt von den Daten ab
  mrSpan: (v) => String(requireNumber('value', v, PARAM_RANGES.mrSpan)),
  unbiased: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
};

/** Parameter, die ändern, welche Schätzer und Felder gelten: sie rechnen sofort statt nach der Pause. */
const IMMEDIATE_KEYS = ['subgroupMode', 'subgroupSize', 'withinMethod', 'mrSpan', 'unbiased'];

/** Die Spalten-Slots dieses Moduls, in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = ['value', 'subgroup'];

/**
 * Je Slot die Wähleroptionen. Der Untergruppen-Filter hängt von der Messwertspalte
 * ab und kommt darum als Funktion zur Laufzeit dazu (`subgroupFilter()`).
 */
const SLOT_FILTERS = { value: { types: ['numeric'] }, subgroup: {} };

/**
 * Je Slot die eine Zuweisungsstelle seines Model-Feldes. Eine gewählte
 * Messwertspalte verwirft eingebettete Beispieldaten, wie die Oberfläche.
 */
const COLUMN_SINKS = {
  value: (m, ref) => { m.columnRef = ref; if (ref !== null) m.clearEmbedded(); },
  subgroup: (m, ref) => { m.subgroupColumnRef = ref; },
};

/**
 * Die Agenten-Lesefläche der Prozessfähigkeit.
 *
 * Nicht die persistierte Form: das Model hält die Eingaben, das Ergebnis und die
 * Schätzer-Mengen entstehen transient am Viewmodel. Darum erklärt dieses Modul
 * seine Lesefläche: Konfiguration, die abgeleiteten Mengen, die `setParam` und
 * `setColumn` prüfen, der Schätzerhinweis und das Ergebnis.
 *
 * @typedef {object} AgentRead
 * @property {object} params  the entered parameters (name, lsl, target, usl, unit, confidence, subgroupMode, subgroupSize, withinMethod, mrSpan, unbiased); values as text as entered, unbiased as boolean
 * @property {object|null} columnRef  the chosen measurement column, `{ instanceId, sheetId, columnId }`, or null
 * @property {object|null} subgroupColumnRef  the chosen subgroup ID column, `{ instanceId, sheetId, columnId }`, or null
 * @property {number[]|null} embeddedValues  [bulk] the values of loaded example data that replace the measurement column, or null
 * @property {string} embeddedLabel  the title of the loaded example data, '' when none
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state
 * @property {string[]} subgroupModeValues  the values `setParam('subgroupMode', …)` accepts: 'size', and 'column' only while no example data are loaded
 * @property {string[]} withinMethodOptions  the values `setParam('withinMethod', …)` accepts: '' (the default of the data) and the estimators that fit the data
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts in the current state
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {object|null} result  the computed capability result, or null while the inputs are incomplete
 * @property {string} withinHint  the note on the estimator or the subgroup column, '' when there is none
 */
const mod = createModule({
  config: {
    id: 'process-capability',
    engine: 'alpine',
    phase: 'measure',
    icon: 'module.process-capability',
    version: '1.2.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      result: null,
      _charts: [],
      _unsubs: [],
      _debTimer: null,
      /** True while a debounced auto-run is pending (reflected as aria-busy). */
      analysisPending: false,
      _renderGen: 0,
      _picker: null,
      _subgroupPicker: null,
      /** Estimator keys that fit the current data (drives the select). */
      methodKeys: [],
      /** Estimator actually used (stored choice or engine default). */
      activeMethod: '',
      /** Hint under the estimator controls ('' = none). */
      withinHint: '',
      /** Empty-state decision for the column area: 'ok' | 'noWorksheet' | 'noNumericColumns'. */
      _colState: 'ok',
      /** Values actually analyzed (aligned to subgroup IDs in column mode). */
      _values: null,

      /** @noagent view transform */
      fmt,

      /** @noagent view transform; title for the embedded-data "remove" button (global i18n key) */
      removeTitle() { return module._context.i18n.t('common.remove'); },

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Konfiguration, wählbare Mengen, Schätzerhinweis und gerechnetes Ergebnis
       */
      read(options) {
        return readAgentState('process-capability', {
          ...this.model.toJSON(),
          activeParams: this.activeParams(),
          subgroupModeValues: this.subgroupModeValues(),
          withinMethodOptions: this.withinMethodOptions(),
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          result: this.result,
          withinHint: this.withinHint,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return PARAM_KEYS.filter((key) => {
          if (key === 'subgroupSize') return this.showSubgroupSize();
          if (key === 'mrSpan') return this.showMrSpan();
          if (key === 'unbiased') return this.showUnbiased();
          return true;
        });
      },

      /** @noagent derived set; der Agent liest sie über read().withinMethodOptions */
      withinMethodOptions() { return ['', ...this.methodKeys]; },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() {
        return COLUMN_SLOTS.filter(slot => slot !== 'subgroup' || this.showSubgroupColumn());
      },

      /** @noagent helper; the one filter of the subgroup picker and of pickableColumns().subgroup */
      subgroupFilter() {
        return (c) => {
          const ref = this.model.columnRef;
          return !!ref && c.instanceId === ref.instanceId && c.sheetId === ref.sheetId
            && c.columnId !== ref.columnId;
        };
      },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return {
          value: pickableColumnList(sm, SLOT_FILTERS.value),
          subgroup: pickableColumnList(sm, { ...SLOT_FILTERS.subgroup, filter: this.subgroupFilter() }),
        };
      },

      /**
       * Einen Parameter setzen.
       * @agent
       * @param {'name'|'lsl'|'target'|'usl'|'unit'|'confidence'|'subgroupMode'|'subgroupSize'|'withinMethod'|'mrSpan'|'unbiased'} key welcher Parameter
       * @param {string|number|boolean} value der Wert; Texte als Text, Ganzzahlen als Zahl oder Zahlentext, unbiased als Wahrheitswert
       * @returns {void}
       * @throws {Error} wenn `key` kein gerade geltender Parameter ist oder `value` nicht zulässig
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        if (key === 'withinMethod') requireEnum('value', value, this.withinMethodOptions());
        if (key === 'subgroupMode') requireEnum('value', value, this.subgroupModeValues());
        this.model.params[key] = PARAM_CHECKS[key](value);
        if (key === 'subgroupMode') this.$nextTick(() => this._mountSubgroupPicker());
        if (IMMEDIATE_KEYS.includes(key)) this.runAnalysis();
        else this.scheduleAnalysis();
      },

      /**
       * Eine Spalte einem Slot zuweisen.
       * @agent
       * @param {'value'|'subgroup'} slot der Slot; `subgroup` gilt nur bei Untergruppen aus einer Spalte
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt oder nicht gültig ist oder die Spalte nicht wählbar
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        const hadEmbedded = !!this.model.embeddedValues;
        if (ref == null) {
          COLUMN_SINKS[slot](this.model, null);
          this._picker?.syncValue(this.model.columnRef);
          this._subgroupPicker?.syncValue(this.model.subgroupColumnRef);
          if (slot === 'value') this._subgroupPicker?.refresh();
          this.runAnalysis();
          return;
        }
        requireEnum('slot', slot, this.activeColumnSlots());
        const keys = this.pickableColumns()[slot].map(c => c.key);
        requireKnownId('ref', refToKey(ref), keys);
        // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
        const clean = keyToRef(refToKey(ref));
        COLUMN_SINKS[slot](this.model, clean);
        if (hadEmbedded) {
          // Die eingebetteten Daten sind verworfen: statt der Anzeige wieder die Wähler zeigen.
          this.$nextTick(() => {
            this._mountPicker();
            this._mountSubgroupPicker();
          });
        } else {
          this._picker?.syncValue(this.model.columnRef);
          this._subgroupPicker?.syncValue(this.model.subgroupColumnRef);
          // Die Untergruppenspalten hängen an der Messwertspalte: den Wähler neu abgleichen.
          if (slot === 'value') this._subgroupPicker?.refresh();
        }
        this.runAnalysis();
      },

      /**
       * Verwirft eingebettete Beispieldaten; danach rechnet das Modul wieder auf einer Spalte.
       * @agent
       * @returns {void}
       */
      clearEmbedded() {
        this.model.clearEmbedded();
        this.$nextTick(() => {
          this._mountPicker();
          this._mountSubgroupPicker();
        });
        this.runAnalysis();
      },

      // ── View transformations ──────────────────────────────────

      /** @noagent view transform */
      statusLabel: (s) => _t({ pass: 'statusPass', fail: 'statusFail', warn: 'statusWarn' }[s] || 'statusWarn'),
      /** @noagent view transform */
      badgeLabel: (s) => _t({ pass: 'capable', fail: 'notCapable', warn: 'condCapable' }[s] || 'condCapable'),
      /** @noagent view transform */
      kpiModClass: (s) => ({ pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' }[s] || ''),

      /** @noagent view transform */
      featureName() { return this.model.params.name || '–'; },

      /** @noagent view transform */
      ciLabel(ci) {
        const r = this.result;
        if (!ci || !r) return '';
        const ciPct = Math.round(r.confidence * 100);
        return `${_t('ci')} ${ciPct}%: [${fmt(ci[0])}; ${fmt(ci[1])}]`;
      },

      /** @noagent view transform; main short-term KPI cells (Cp / Cpk / CPL / CPU) */
      mainKpis() {
        const r = this.result;
        if (!r) return [];
        const cells = [];
        if (r.Cp != null) {
          cells.push({
            key: 'cp',
            mod: this.kpiModClass(r.cpStatus),
            label: `Cp (${_t('potential')})`,
            value: fmt(r.Cp),
            sub: `${_t('threshold')}: ≥ 1.33 · ${this.badgeLabel(r.cpStatus)}${r.CpCI ? ` · ${this.ciLabel(r.CpCI)}` : ''}`,
          });
        }
        cells.push({
          key: 'cpk',
          mod: this.kpiModClass(r.cpkStatus),
          label: `Cpk (${_t('actual')})`,
          value: fmt(r.Cpk),
          sub: `${_t('threshold')}: ≥ 1.33 · ${this.badgeLabel(r.cpkStatus)}${r.CpkCI ? ` · ${this.ciLabel(r.CpkCI)}` : ''}`,
        });
        if (r.CPL != null) {
          cells.push({
            key: 'cpl',
            mod: '',
            label: `CPL (${_t('lower')})`,
            value: fmt(r.CPL),
            sub: `(x̄ − LSL) / 3 ${_t('sigmaWithinSym')}`,
          });
        }
        if (r.CPU != null) {
          cells.push({
            key: 'cpu',
            mod: '',
            label: `CPU (${_t('upper')})`,
            value: fmt(r.CPU),
            sub: `(USL − x̄) / 3 ${_t('sigmaWithinSym')}`,
          });
        }
        return cells;
      },

      /** @noagent view transform; long-term performance KPI cells (Pp / Ppk / PPM / Sigma) */
      perfKpis() {
        const r = this.result;
        if (!r) return [];
        const cells = [];
        if (r.Pp != null) {
          cells.push({
            key: 'pp',
            label: `Pp (${_t('overallPotential')})`,
            value: fmt(r.Pp),
            sub: `${_t('longTerm')}${r.PpCI ? ` · ${this.ciLabel(r.PpCI)}` : ''}`,
          });
        }
        if (r.Ppk != null) {
          cells.push({
            key: 'ppk',
            label: `Ppk (${_t('overallActual')})`,
            value: fmt(r.Ppk),
            sub: `${_t('longTerm')}${r.PpkCI ? ` · ${this.ciLabel(r.PpkCI)}` : ''}`,
          });
        }
        cells.push({
          key: 'ppm',
          label: `PPM (${_t('defective')})`,
          value: fmt(r.ppmTotal),
          sub: `${_t('perMillion')} · ${_t('ppmObservedShort')} ${fmt(r.ppmObservedTotal, 0)} · ${_t('ppmWithinShort')} ${fmt(r.ppmWithinTotal, 0)}`,
        });
        cells.push({
          key: 'sigma',
          label: _t('sigmaLevel'),
          value: `${fmtZ(r.sigmaLevel)}σ`,
          sub: `${_t('zBenchOverall')} ${fmtZ(r.zBenchOverall, 2)} · ${_t('sixSigmaConvention')} ${fmtZ(r.sigmaLevelShifted, 2)}`,
        });
        return cells;
      },

      /** @noagent view transform; localized estimator name for the select and the formula block */
      methodName(key) { return key ? _t(`withinMethodNames.${key}`) : ''; },

      /** @noagent helper; ν with at most two decimals (R̄ and S̄ give fractional ν) */
      fmtDf(v) { return Number.isInteger(v) ? String(v) : v.toFixed(2); },

      /** Short estimator symbol, e.g. "R̄/d2", "S̄", "√MSSD/c4′". */
      _methodSymbol(r) {
        const c = r.unbiased;
        return {
          pooled: c ? 's_p/c4' : 's_p',
          rbar: 'R̄/d2',
          sbar: c ? 'S̄/c4' : 'S̄',
          averageMR: 'MR̄/d2',
          medianMR: 'MR̃/d4',
          sqrtMSSD: c ? '√MSSD/c4′' : '√MSSD',
        }[r.withinMethod];
      },

      /** @noagent view transform; stats label for σ within: estimator and basis, e.g. "(R̄/d2, k = 25, n̄ = 5, ν = 90)" */
      withinLabel() {
        const r = this.result;
        if (!r) return '';
        const parts = [this._methodSymbol(r)];
        if (SUBGROUP_METHODS.includes(r.withinMethod)) {
          parts.push(`k = ${r.subgroupCount}`, `n̄ = ${fmtNBar(r.nBar)}`);
        } else if (r.withinMethod !== 'sqrtMSSD') {
          parts.push(`w = ${r.mrSpan}`);
        }
        parts.push(`ν = ${this.fmtDf(r.withinDf)}`);
        return `${_t('statStddevWithin')} (${parts.join(', ')})`;
      },

      /** @noagent view transform; whether the moving-range span applies (activeParams uses the same test) */
      showMrSpan() { return this.activeMethod === 'averageMR' || this.activeMethod === 'medianMR'; },
      /** @noagent view transform; whether the unbiasing switch applies (activeParams uses the same test) */
      showUnbiased() { return ['pooled', 'sbar', 'sqrtMSSD'].includes(this.activeMethod); },
      /** @noagent view transform; whether the fixed subgroup size applies (activeParams uses the same test) */
      showSubgroupSize() { return this.model.effectiveSubgroupMode() === 'size'; },
      /** @noagent view transform; whether the subgroup column applies (activeColumnSlots uses the same test) */
      showSubgroupColumn() { return this.model.effectiveSubgroupMode() === 'column'; },

      /** @noagent derived set; der Agent liest sie über read().subgroupModeValues ('column' nur, solange keine Beispieldaten geladen sind; Radio und setParam nutzen sie) */
      subgroupModeValues() {
        return SUBGROUP_MODES.filter(m => m !== 'column' || !this.model.embeddedValues);
      },

      /** @noagent view transform; the subgroup modes of the radio group (one source: SUBGROUP_MODES) */
      subgroupModeOptions() {
        return SUBGROUP_MODES.map(value => ({
          value,
          label: _t(value === 'size' ? 'subgroupModeSize' : 'subgroupModeColumn'),
        }));
      },

      /**
       * DOM handler for the whole-number inputs: a value the sink refuses is
       * reset to the model value instead of throwing into the event loop.
       * @noagent DOM event handler; the agent uses setParam()
       */
      onWholeNumberInput(key, event) {
        try {
          PARAM_CHECKS[key](event.target.value);
        } catch {
          event.target.value = this.model.params[key];
          return;
        }
        this.setParam(key, event.target.value);
      },

      /** @noagent view transform; horizontal stats table columns (label/value pairs) */
      statCols() {
        const r = this.result;
        if (!r) return [];
        const unit = this.model.params.unit || '';
        return [
          { label: _t('statN'), value: String(r.n) },
          { label: _t('statMean'), value: `${fmt(r.xbar)} ${unit}` },
          { label: this.withinLabel(), value: `${fmt(r.sigmaWithin)} ${unit}` },
          { label: _t('statStddevS'), value: `${fmt(r.s)} ${unit}` },
          { label: _t('statMin'), value: `${fmt(r.xmin)} ${unit}` },
          { label: _t('statMax'), value: `${fmt(r.xmax)} ${unit}` },
          r.hasLsl ? { label: 'LSL', value: `${fmt(r.lsl)} ${unit}` } : null,
          r.hasUsl ? { label: 'USL', value: `${fmt(r.usl)} ${unit}` } : null,
          r.T != null ? { label: _t('statTol'), value: `${fmt(r.T)} ${unit}` } : null,
          r.targetVal != null ? { label: _t('statTarget'), value: `${fmt(r.targetVal)} ${unit}` } : null,
        ].filter(Boolean);
      },

      /** @noagent view transform; PPM table rows (observed / expected within / expected overall); "—" for a missing limit */
      ppmRows() {
        const r = this.result;
        if (!r) return [];
        const cell = (v) => (v == null ? '—' : fmt(v, 2));
        return [
          { key: 'observed', label: _t('ppmRowObserved'), below: cell(r.ppmObservedBelowLsl), above: cell(r.ppmObservedAboveUsl), total: cell(r.ppmObservedTotal) },
          { key: 'within', label: _t('ppmRowWithin'), below: cell(r.ppmWithinBelowLsl), above: cell(r.ppmWithinAboveUsl), total: cell(r.ppmWithinTotal) },
          { key: 'overall', label: _t('ppmRowOverall'), below: cell(r.ppmBelowLsl), above: cell(r.ppmAboveUsl), total: cell(r.ppmTotal) },
        ];
      },

      /** @noagent view transform; formula line: Z.bench within = −Φ⁻¹(p < LSL + p > USL) = value */
      zBenchLine() {
        const r = this.result;
        if (!r) return '';
        const parts = [r.hasLsl ? 'p(< LSL)' : null, r.hasUsl ? 'p(> USL)' : null].filter(Boolean).join(' + ');
        return `Z.bench = −Φ⁻¹(${parts}) = −Φ⁻¹(${fmtFraction(r.ppmWithinTotal / 1e6)}) = ${fmtZ(r.zBenchWithin)}`;
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      /** @noagent helper */
      parseNum(s) {
        if (s == null || s === '') return NaN;
        return parseFloat(String(s).replace(',', '.').trim());
      },

      /** @noagent helper; resolved confidence as a fraction (0 < c < 1), from the percent input */
      confidenceFraction() {
        const raw = this.parseNum(this.model.params.confidence);
        if (!isNaN(raw) && raw > 0) {
          return Math.max(50, Math.min(99.99, raw)) / 100;
        }
        return (module._context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
      },

      /** @noagent helper; live measurement values — embedded example data takes precedence */
      columnValues() {
        if (this.model.embeddedValues) {
          return this.model.embeddedValues.filter(v => typeof v === 'number' && !isNaN(v));
        }
        if (!this.model.columnRef) return [];
        return getColumnValues(module._context.stateManager, this.model.columnRef)
          .filter(v => v != null && typeof v === 'number' && !isNaN(v));
      },

      /**
       * Values and, in ID-column mode, their aligned subgroup IDs.
       * @noagent helper
       * @returns {{ values: number[], ids: string[]|null, missingIds: boolean }}
       */
      analysisInput() {
        if (this.model.effectiveSubgroupMode() !== 'column') {
          return { values: this.columnValues(), ids: null, missingIds: false };
        }
        if (!this.model.columnRef) return { values: [], ids: null, missingIds: false };
        if (!this.model.subgroupColumnMatches()) return { values: [], ids: null, missingIds: true };
        const sm = module._context.stateManager;
        const { values, ids } = alignValuesAndIds(
          getColumnValues(sm, this.model.columnRef),
          getColumnValues(sm, this.model.subgroupColumnRef));
        return { values, ids, missingIds: false };
      },

      /**
       * Computes with the current inputs. Incomplete or invalid inputs leave
       * `result` at null without an error; a problem with the estimator (wrong
       * method for the data, table limits) is named in `withinHint`.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        this.withinHint = '';
        // Without data the method list follows the settings alone (ID column →
        // subgroups, fixed size n → subgroups for n ≥ 2), so a fresh or emptied
        // module never shows an empty or stale estimator select.
        this._applyMethods([new Array(
          this.model.effectiveSubgroupMode() === 'column' ? 2 : this.model.subgroupSizeValue()).fill(0)]);
        if (!this.model.columnRef && !this.model.embeddedValues) return this.clearResults();
        const { values, ids, missingIds } = this.analysisInput();
        if (missingIds) this.withinHint = _t('subgroupColumnMissing');
        if (values.length === 0) return this.clearResults();

        const groups = ids
          ? splitSubgroups(values, { ids })
          : splitSubgroups(values, { size: this.model.subgroupSizeValue() });
        const { stored, method } = this._applyMethods(groups);
        if (stored && stored !== method) {
          this.withinHint = _t('methodFallbackHint', {
            method: this.methodName(stored),
            kind: _t(SUBGROUP_METHODS.includes(stored) ? 'kindSubgroups' : 'kindIndividuals'),
            fallback: this.methodName(method),
          });
        }

        const p = this.model.params;
        const lsl = this.parseNum(p.lsl);
        const usl = this.parseNum(p.usl);
        const target = this.parseNum(p.target);
        const params = {
          lsl: isNaN(lsl) ? null : lsl,
          usl: isNaN(usl) ? null : usl,
          target: isNaN(target) ? null : target,
          confidence: this.confidenceFraction(),
          withinMethod: method,
          unbiased: p.unbiased !== false,
          mrSpan: this.model.mrSpanValue(),
        };
        if (ids) params.subgroupIds = ids;
        else params.subgroupSize = this.model.subgroupSizeValue();

        const validation = validate(params, values);
        if (!validation.valid) return this.clearResults();

        try {
          this.result = analyze(params, values);
        } catch (e) {
          if (!(e instanceof SigmaWithinError)) throw e;
          const key = { subgroupTooLarge: 'errWithinSubgroupTooLarge', spanTooLarge: 'errWithinSpanTooLarge' }[e.code]
            || 'errWithinMethodInvalid';
          this.withinHint = _t(key);
          return this.clearResults();
        }
        this._values = values;
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderHistogram(this.result, gen));
      },

      /**
       * Derive the offered estimators and the active one for these groups.
       * @param {number[][]} groups
       * @returns {{ stored: string, method: string }}
       */
      _applyMethods(groups) {
        const valid = validMethods(groups);
        const stored = this.model.params.withinMethod;
        const method = valid.includes(stored) ? stored : defaultMethod(groups);
        this.methodKeys = valid;
        this.activeMethod = method;
        return { stored, method };
      },

      /**
       * Triggers the computation after a short pause; a second request before that replaces the first.
       * @agent
       * @returns {void}
       */
      scheduleAnalysis() {
        clearTimeout(this._debTimer);
        this.analysisPending = true;
        this._debTimer = setTimeout(() => {
          this.runAnalysis();
          this.analysisPending = false;
        }, AUTORUN_DELAY);
      },

      /**
       * Discards the result and the histogram; the inputs stay.
       * @agent
       * @returns {void}
       */
      clearResults() {
        this.result = null;
        this._values = null;
        this._destroyCharts();
      },

      // ── SVG chart (imperative via chartManager) ───────────────

      async _renderHistogram(r, gen) {
        this._destroyCharts();
        const el = module._container.querySelector('[data-ref="chart-hist"]');
        if (!el) return;
        const values = this._values || [];
        if (values.length === 0) return;

        const refLines = [];
        if (r.hasLsl) refLines.push({ dir: 'v', value: r.lsl, label: 'LSL', color: 'var(--color-error)', dash: 'dash', width: 1.5, showLabel: true });
        if (r.hasUsl) refLines.push({ dir: 'v', value: r.usl, label: 'USL', color: 'var(--color-error)', dash: 'dash', width: 1.5, showLabel: true });
        if (r.targetVal != null) refLines.push({ dir: 'v', value: r.targetVal, label: 'Target', color: 'var(--color-success)', dash: 'dash', width: 1.5, showLabel: true });

        const chart = await module._context.chartManager.create(el, 'histogram', {
          data: values,
          binMethod: 'sturges',
          showNormalCurve: true,
          barColor: 'var(--color-accent)',
          normalCurveColor: 'var(--color-info)',
          showLegend: true,
          refLines,
        });
        // Stale-render guard: a newer render started while we awaited.
        if (gen !== this._renderGen) {
          module._context.chartManager.destroy(chart);
          return;
        }
        this._charts.push(chart);
      },

      _destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── Worksheet column picker (shared ColumnPicker, 'select' mode) ──

      /** Option label: "C1 – Name (n=30)" / "C1 (n=30)" (matches legacy). */
      _optionLabel(c) {
        return c.columnName
          ? `${c.shortName} – ${c.columnName} (n=${c.valueCount})`
          : `${c.shortName} (n=${c.valueCount})`;
      },

      /** True if at least one Worksheet module instance exists in any phase. */
      _hasWorksheet() {
        const sm = module._context.stateManager;
        for (const phase of Object.keys(sm.get('phases') || {})) {
          const instances = sm.get(`phases.${phase}`) ?? [];
          if (instances.some(i => i.moduleId === 'worksheet')) return true;
        }
        return false;
      },

      /**
       * Decide which column-area state to show (drives the declarative empty
       * states vs. the picker in the template). External worksheet state is not
       * auto-tracked by Alpine, so this is recomputed explicitly whenever the
       * worksheet/data may have changed. Mutating `_colState` triggers the
       * x-if/x-show re-render.
       */
      _computeColState() {
        if (this.model.embeddedValues) { this._colState = 'ok'; return; }
        const cols = discoverColumns(module._context.stateManager, { types: ['numeric'] });
        if (cols.length > 0) { this._colState = 'ok'; return; }
        this._colState = this._hasWorksheet() ? 'noNumericColumns' : 'noWorksheet';
      },

      /**
       * (Re)mount the shared ColumnPicker into its anchor. Skipped while
       * embedded-example data is active (the template shows the pill instead).
       * The picker owns worksheet-column discovery + its own focus-guarded
       * refresh, so the module no longer needs bespoke event wiring for that.
       */
      _mountPicker() {
        this._computeColState();
        if (this.model.embeddedValues) return;
        // No selectable numeric columns: the template shows a dedicated empty
        // state instead of the picker, so don't mount it (cleaner DOM).
        if (this._colState !== 'ok') {
          if (this._picker) { this._picker.destroy(); this._picker = null; }
          return;
        }
        const wrap = module._container.querySelector('[data-ref="col-select-wrap"]');
        if (!wrap) return;
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'select',
          ...SLOT_FILTERS.value,
          optionFormat: (c) => this._optionLabel(c),
          onChange: (ref) => this.setColumn('value', ref),
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },

      /**
       * (Re)mount the ID-column picker in column mode. Offers every column of
       * the measurement column's sheet except the measurement column itself.
       */
      _mountSubgroupPicker() {
        if (this._subgroupPicker) { this._subgroupPicker.destroy(); this._subgroupPicker = null; }
        if (this.model.effectiveSubgroupMode() !== 'column') return;
        const wrap = module._container.querySelector('[data-ref="subgroup-col-wrap"]');
        if (!wrap) return;
        this._subgroupPicker = new ColumnPicker(wrap, module._context, {
          mode: 'select',
          ...SLOT_FILTERS.subgroup,
          filter: this.subgroupFilter(),
          optionFormat: (c) => this._optionLabel(c),
          onChange: (ref) => this.setColumn('subgroup', ref),
        });
        if (this.model.subgroupColumnRef) {
          this._subgroupPicker.value = this.model.subgroupColumnRef;
          // Drop a stored ref the filter no longer offers (e.g. it became the
          // measurement column meanwhile); refresh() reports it via onChange.
          this._subgroupPicker.refresh();
        }
      },

      /**
       * Worksheet structure/data may have changed externally: re-decide the
       * empty-state vs. picker, re-mount the picker when needed, and re-run.
       * Skipped while the user is interacting with the mounted picker (the
       * picker self-refreshes its options in that case).
       */
      _refreshColArea() {
        const wrap = module._container.querySelector('[data-ref="col-select-wrap"]');
        const active = document.activeElement;
        const focused = Boolean(active && wrap && wrap.contains(active));
        if (!focused) {
          const prev = this._colState;
          this._computeColState();
          // Re-mount only when the state crossed the empty/ok boundary (i.e.
          // the picker needs to appear or disappear). When it stays 'ok', the
          // mounted picker refreshes its own option list — no churn needed.
          const wasOk = prev === 'ok' && !this.model.embeddedValues;
          const nowOk = this._colState === 'ok' && !this.model.embeddedValues;
          if (wasOk !== nowOk) this.$nextTick(() => this._mountPicker());
        }
        this.runAnalysis();
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      /** @noagent lifecycle */
      init() {
        // Fresh per-instance collections (the data() object is shared by Alpine.data).
        this._charts = [];
        this._unsubs = [];

        this._mountPicker();
        this._mountSubgroupPicker();

        const eb = module._context.eventBus;

        // Worksheet data/structure may change externally (Alpine cannot track
        // it): re-decide empty-state vs. picker, re-mount across the boundary,
        // and re-derive the analysis result.
        const onData = () => this._refreshColArea();
        eb.on('state:saved', onData);
        eb.on('worksheet:dataChanged', onData);
        this._unsubs.push(() => eb.off('state:saved', onData));
        this._unsubs.push(() => eb.off('worksheet:dataChanged', onData));

        const onMod = ({ moduleId }) => { if (moduleId === 'worksheet') this._refreshColArea(); };
        eb.on('module:added', onMod);
        eb.on('module:removed', onMod);
        this._unsubs.push(() => eb.off('module:added', onMod));
        this._unsubs.push(() => eb.off('module:removed', onMod));

        const onTheme = () => {
          if (this.result) this._renderHistogram(this.result, ++this._renderGen);
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
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        if (this._subgroupPicker) { this._subgroupPicker.destroy(); this._subgroupPicker = null; }
        clearTimeout(this._debTimer);
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: process-capability examples ship a CSV-shaped payload
 * (`data.columns[0].values`) plus a `meta.spec`. We embed the values directly
 * (bypassing the worksheet), apply the spec, and re-run the analysis. This
 * replaces the generic createModule loadExample, which would feed the raw
 * example payload through Model.fromJSON (the shapes do not match).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const t = (key, vars) => ctx.i18n.t(key, vars);

  // Warn before overwriting existing data.
  const current = this.getState();
  const model = current ? State.fromJSON(current) : null;
  if (model?.hasContent() && ctx?.confirmPopout) {
    const ok = await ctx.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
    if (!ok) return;
  }

  const col = payload.data.columns?.[0];
  if (!col || !Array.isArray(col.values)) {
    ctx.notify?.(t('moduleHelp.exampleLoadError'), 'error');
    return;
  }
  const values = col.values.filter(v => typeof v === 'number' && !isNaN(v));
  if (values.length === 0) {
    ctx.notify?.(t('moduleHelp.exampleLoadError'), 'error');
    return;
  }

  const next = State.fromJSON(current);
  next.embeddedValues = values;
  const lang = ctx.i18n.getLanguage();
  const label = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  next.embeddedLabel = label;
  next.columnRef = null;

  // Apply spec from meta if present.
  const spec = payload.meta?.spec || {};
  if (typeof spec.lsl === 'number') next.params.lsl = String(spec.lsl);
  if (typeof spec.usl === 'number') next.params.usl = String(spec.usl);
  if (typeof spec.target === 'number') next.params.target = String(spec.target);

  // Use feature name from meta and unit from first column.
  if (payload.meta?.title) next.params.name = label;
  if (col.unit) next.params.unit = col.unit;
  else if (payload.meta?.columns?.[0]?.unit) next.params.unit = payload.meta.columns[0].unit;

  this.setState(next.toJSON());
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  ctx.notify?.(t('moduleHelp.exampleLoaded', { title: label }), 'success');
};

export default mod;
