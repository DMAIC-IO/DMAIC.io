/**
 * D.Mike — Attribute Control Chart Module (attribute-control-chart.js)
 * Control phase: SPC charts for attribute (count/proportion) data.
 *
 *   p   — proportion defective, variable subgroup size
 *   np  — number defective,     constant subgroup size
 *   c   — defects per unit,     constant area of opportunity
 *   u   — defects per unit,     variable area of opportunity
 *
 * Data is selected via column-picker. Required columns depend on chart type:
 *   p, u  → defect-count column + sample-size column (variable n allowed)
 *   np    → defect-count column + single n input (constant)
 *   c     → defect-count column only
 *
 * Migrated to createModule + Alpine CSP. The Model holds only the persisted
 * inputs; the analysis result (limits, violations) is derived transiently in
 * the view from those inputs plus the live worksheet column values. The SPC
 * math lives in attribute-control-chart-engine.js. The ColumnPickers and the
 * SVG control chart are mounted imperatively (they are not pure-template
 * concerns).
 *
 * @agent  Steuerbar über das Viewmodel: Kartentyp, konstantes n, Phase I,
 *   Regeln (setParam), Fehler- und Stichprobenspalte (setColumn), neu
 *   rechnen (runAnalysis). Gelesen wird über read() mit erklärter Lesefläche
 *   (AgentRead) — Eingaben, Grenzen, Regelverletzungen und je Punkt Wert,
 *   n und Grenzen.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './attribute-control-chart-model.js';

import {
  ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef,
} from '../../ui/column-picker.js';

import {
  getAttributeChartType,
  ATTRIBUTE_CHART_TYPES,
  ATTRIBUTE_NELSON_RULES,
} from '../../engines/attribute-control-chart-engine.js';
import { analyzeState } from './attribute-control-chart-analysis.js';

import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireNumber } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { finiteOrNull, zipPoints } from '../../core/agent/agent-results.js';

/** Auto-run debounce delay (ms) — matches the legacy module. */
const AUTORUN_DELAY = 120;

/** Die Spalten-Slots in der Reihenfolge der Oberfläche; `size` nur bei p und u. */
const COLUMN_SLOTS = ['defects', 'size'];

/** Je Slot der Filter seines Wählers — eine Quelle für Wähler und Lesefläche. */
const SLOT_FILTERS = {
  defects: { types: ['numeric'], minCount: 2 },
  size: { types: ['numeric'], minCount: 2 },
};

/** Je Slot die eine Zuweisungsstelle seines Model-Feldes. */
const COLUMN_SINKS = {
  defects: (m, ref) => { m.defectsRef = ref; },
  size: (m, ref) => { m.sizeRef = ref; },
};

/** Die Kartentyp-Ids, in der Reihenfolge der Engine. */
const CHART_TYPE_IDS = ATTRIBUTE_CHART_TYPES.map(t => t.id);

/** Die Ids der Regeln, die diese Karte kennt. */
const RULE_IDS = ATTRIBUTE_NELSON_RULES.map(r => r.id);

/** Die Optionen, die `setParam` annimmt (`constantN` nur bei np). */
const PARAM_KEYS = ['chartTypeId', 'constantN', 'baselineCount', 'enabledRules'];

/** Die Leerform eines Zahlenfelds („alle Punkte"): `null` oder `''`. */
const isEmptyForm = (v) => v === null || v === '';

/** Je Option ihr Prüfer; er gibt den Wert in der Form des Models zurück. */
const PARAM_CHECKS = {
  chartTypeId: (v) => { requireEnum('value', v, CHART_TYPE_IDS); return v; },
  constantN: (v) => requireNumber('value', v, { min: 1, integer: true }),
  baselineCount: (v) => (isEmptyForm(v) ? null : requireNumber('value', v, { min: 1, integer: true })),
  enabledRules: (v) => {
    if (!Array.isArray(v)) {
      throw new Error(`invalid value ${JSON.stringify(v)}; allowed: a list of rule ids from ${RULE_IDS.join(', ')}`);
    }
    for (const r of v) requireEnum('rule', r, RULE_IDS);
    return [...new Set(v)].sort((a, b) => a - b);
  },
};

/**
 * Einen Wert unter einem Punkt-Schlüssel (`'statParams.trim'`) in `obj` ablegen.
 * @param {object} obj Wurzel, deren Pfad beschrieben wird
 * @param {string} key Schlüssel, gegebenenfalls mit Punkt
 * @param {any} value der abzulegende Wert
 */
function setAtPath(obj, key, value) {
  const parts = key.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'p'|'np'|'c'|'u'} chartTypeId  Kartentyp
 * @property {number} [constantN]  fester Stichprobenumfang, nur bei np
 * @property {number} baselineCount  Punkte der Baseline, leer für alle
 * @property {number[]} enabledRules  angehakte Regeln aus 1, 2, 3, 5, 6
 */

/**
 * Das gerechnete Ergebnis (`_agentResult()`), wie `read().result` es liefert
 * — nicht das gleichnamige Viewmodel-Feld der Vorlage.
 *
 * @typedef {object} Result
 * @property {'p'|'np'|'c'|'u'} chartType  Kartentyp
 * @property {'proportion'|'count'|'rate'} statistic  gezeichnete Größe
 * @property {number} valid  verwertete Punkte
 * @property {number|null} cl  Mittellinie
 * @property {number|null} ucl  obere Eingriffsgrenze, leer wenn je Punkt wechselnd
 * @property {number|null} lcl  untere Eingriffsgrenze, leer wenn je Punkt wechselnd
 * @property {number|null} sigma  Streuung, leer wenn je Punkt wechselnd
 * @property {boolean} variableLimits  Grenzen wechseln je Punkt
 * @property {Violation[]} violations  Regelverletzungen
 * @property {number[]} signals  verletzende Punkte ohne Doppelte
 */

/**
 * @typedef {object} Violation
 * @property {number} index  Punkt, ab 0 über die verwerteten Punkte
 * @property {number} ruleId  Regel
 */

/**
 * Die Agenten-Lesefläche der Attributkarte (p, np, c, u).
 *
 * Eingaben (Kartentyp, Fehler- und Stichprobenspalte, konstantes n, Phase I,
 * Regeln), die Mengen der Setter und das Ergebnis als Zahlen (Plan Welle 3 B,
 * E4). Nicht darin: Kennzahlenleiste, Verletzungsliste als Text,
 * Klappzustand der Regeln, `exampleWorksheetId`.
 *
 * @typedef {object} AgentRead
 * @property {string} chartTypeId  `'p'`, `'np'`, `'c'` or `'u'`
 * @property {object|null} defectsRef  the defects or defectives column (slot `defects`), `{ instanceId, sheetId, columnId }`, or null
 * @property {object|null} sizeRef  the sample size column (slot `size`, used by p and u), or null
 * @property {number} constantN  the constant sample size of the np chart
 * @property {number|null} baselineCount  Phase I length, or null for all points
 * @property {number[]} enabledRules  the rule ids checked, sorted
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts for the current chart type
 * @property {string[]} activeParams  the keys `setParam` accepts for the current chart type
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {Result|null} result  the computed result (ucl/lcl/sigma null when the limits vary per point); null without the needed columns or with fewer than 2 usable points
 * @property {object[]} points  [bulk] one row per plotted point: `{ value, n, ucl, lcl, signal }` (n null for the c chart)
 */

const mod = createModule({
  config: {
    id: 'attribute-control-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.attribute-control-chart',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      result: null,
      _lastResult: null,
      nelsonCollapsed: false,
      _pickerDefects: null,
      _pickerSize: null,
      _charts: [],
      _unsubs: [],
      _autoRunTimer: null,
      _renderGen: 0,

      // ── Static lists for the template ─────────────────────────
      nelsonRules: ATTRIBUTE_NELSON_RULES,

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       *   — `fields: ['points']` liefert die Punkte vollständig, `rows` schneidet sie zu
       * @returns {AgentRead} Eingaben, wählbare Mengen und das gerechnete Ergebnis
       */
      read(options) {
        const m = this.model;
        const { result, points, pointsColumns } = this._agentResult();
        return readAgentState('attribute-control-chart', {
          chartTypeId: m.chartTypeId,
          defectsRef: m.defectsRef,
          sizeRef: m.sizeRef,
          constantN: m.constantN,
          baselineCount: m.baselineCount,
          enabledRules: [...m.enabledRules],
          activeColumnSlots: this.activeColumnSlots(),
          activeParams: this.activeParams(),
          pickableColumns: this.pickableColumns(),
          result,
          points,
          pointsColumns,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() {
        return this.requiresSampleSize() ? ['defects', 'size'] : ['defects'];
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return ['chartTypeId', ...(this.requiresConstantN() ? ['constantN'] : []), 'baselineCount', 'enabledRules'];
      },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(COLUMN_SLOTS.map(slot => [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /** @noagent view transform; die Optionen der Kartentyp-Auswahl (eine Quelle: ATTRIBUTE_CHART_TYPES) */
      chartTypeOptions() { return CHART_TYPE_IDS.map(v => ({ value: v, label: _t(`type_${v}`) })); },

      /**
       * Eine Spalte einem Slot zuweisen und neu rechnen.
       * @agent
       * @param {'defects'|'size'} slot der Slot; read().activeColumnSlots nennt die für den Kartentyp gültigen
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren (auch in einem gerade inaktiven Slot)
       * @returns {Promise<void>}
       * @throws {Error} wenn `slot` unbekannt oder gerade nicht aktiv ist oder die Spalte nicht wählbar
       */
      async setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        let clean = null;
        if (ref != null) {
          requireEnum('slot', slot, this.activeColumnSlots());
          const keys = this.pickableColumns()[slot].map(c => c.key);
          requireKnownId('ref', refToKey(ref), keys);
          // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
          clean = keyToRef(refToKey(ref));
        }
        COLUMN_SINKS[slot](this.model, clean);
        this._pickerOf(slot)?.syncValue(clean);
        await this.runAnalysis();
      },

      /**
       * Eine Analyseoption setzen und neu rechnen.
       * @agent
       * @param {keyof Params} key welche Option; die im Zustand zulässigen nennt `activeParams`
       * @param {string|number|number[]|null} value der Wert; Typ und Bereich je Schlüssel siehe `Params`
       * @returns {Promise<void>}
       * @throws {Error} wenn `key` unbekannt oder für den Kartentyp nicht aktiv ist oder `value` ungültig
       */
      async setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        await this.runAnalysis();
      },

      /** Der Wähler eines Slots. */
      _pickerOf(slot) { return slot === 'defects' ? this._pickerDefects : this._pickerSize; },

      /** Eindeutige Paare (Index, Regel), nach Index sortiert — eine Quelle für violationRows und read(). */
      _uniqueViolations() {
        const violations = this._lastResult?.violations || [];
        const unique = [];
        const seen = new Set();
        violations.forEach(v => {
          const k = `${v.index}-${v.ruleId}`;
          if (!seen.has(k)) { seen.add(k); unique.push(v); }
        });
        return unique.sort((a, b) => a.index - b.index);
      },

      /** Ergebnis und Punkte für read(), aus `_lastResult` (E4). */
      _agentResult() {
        const a = this._lastResult;
        if (!a) return { result: null, points: [], pointsColumns: [] };
        const r = a.result;
        const violations = this._uniqueViolations().map(v => ({ index: v.index, ruleId: v.ruleId }));
        const signals = [...new Set(violations.map(v => v.index))];
        const scalar = (v) => (Array.isArray(v) ? null : finiteOrNull(v));
        const { rows, columns } = zipPoints(
          { value: r.values, n: a.n, ucl: r.ucl, lcl: r.lcl },
          { signal: signals },
        );
        return {
          result: {
            chartType: this.model.chartTypeId,
            statistic: r.statistic,
            valid: a.valid,
            cl: finiteOrNull(r.cl),
            ucl: scalar(r.ucl),
            lcl: scalar(r.lcl),
            sigma: scalar(r.sigma),
            variableLimits: Boolean(r.variableLimits),
            violations,
            signals,
          },
          points: rows,
          pointsColumns: columns,
        };
      },

      // ── View transformations ──────────────────────────────────

      /** @noagent view transform */
      requiresSampleSize() {
        const ct = getAttributeChartType(this.model.chartTypeId);
        return Boolean(ct?.requiresSampleSize);
      },
      /** @noagent view transform */
      requiresConstantN() {
        const ct = getAttributeChartType(this.model.chartTypeId);
        return Boolean(ct?.requiresConstantN);
      },

      /** @noagent view transform */
      nelsonRuleShort(rule) {
        const lang = module._context.language || 'de';
        return rule.short[lang] || rule.short.de;
      },
      /** @noagent view transform */
      nelsonRuleDesc(rule) {
        const lang = module._context.language || 'de';
        return rule.desc[lang] || rule.desc.de;
      },

      // ── Stats KPI strip (derived from this.result) ────────────

      _meanArr(a) {
        return Array.isArray(a) ? a.reduce((s, x) => s + x, 0) / Math.max(1, a.length) : a;
      },
      /** @noagent view transform */
      fmtCL() {
        const r = this.result;
        return r && Number.isFinite(r.cl) ? r.cl.toFixed(4) : '–';
      },
      /** @noagent view transform */
      uclMeanStr() {
        const r = this.result;
        return r ? this._meanArr(r.ucl).toFixed(3) : '';
      },
      /** @noagent view transform */
      lclMeanStr() {
        const r = this.result;
        return r ? this._meanArr(r.lcl).toFixed(3) : '';
      },
      /** @noagent view transform */
      limitsLabel() {
        const r = this.result;
        return r && r.variableLimits ? 'UCL̄ / LCL̄' : 'UCL / LCL';
      },
      /** @noagent view transform; unique-index violation count (matches legacy stat) */
      violationCount() {
        return new Set((this._lastResult?.violations || []).map(v => v.index)).size;
      },
      /** @noagent view transform */
      validCount() {
        return this._lastResult?.valid ?? 0;
      },

      // ── Chart header (badge uses RAW violation count, like legacy) ──

      /** @noagent view transform */
      chartTitle() {
        const colName = getColumnName(module._context.stateManager, this.model.defectsRef);
        return _t(`subchart_${  this.model.chartTypeId}`, { col: colName });
      },
      /** @noagent view transform */
      isStable() {
        return (this._lastResult?.violations || []).length === 0;
      },
      /** @noagent view transform */
      badgeText() {
        const violations = this._lastResult?.violations || [];
        return violations.length === 0
          ? _t('stable')
          : _t('unstable', { count: violations.length });
      },
      /** @noagent view transform */
      badgeIcon() {
        return this.isStable() ? 'status.ok' : 'status.warning';
      },

      // ── Violations panel (unique index-ruleId pairs, sorted) ──

      /** @noagent view transform */
      violationRows() {
        const lang = module._context.language || 'de';
        return this._uniqueViolations().map(v => {
          const rule = ATTRIBUTE_NELSON_RULES.find(r => r.id === v.ruleId);
          return {
            index: v.index,
            ruleId: v.ruleId,
            desc: rule ? (rule.short[lang] || rule.short.de) : '',
          };
        });
      },
      /** @noagent view transform */
      violationsHeader() {
        const count = this.violationRows().length;
        return `⚑ ${  _t('violationsTitle', { count })}`; // ⚑
      },

      // ── Event handlers ─────────────────────────────────────────

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} event die Änderung des konstanten n
       */
      async constantNChanged(event) {
        const v = parseInt(event.target.value, 10);
        // Wie bisher: ein ungültiger Wert fällt auf 50 zurück — vor der Senke (E6).
        await this.setParam('constantN', (Number.isFinite(v) && v > 0) ? v : 50);
        event.target.value = String(this.model.constantN);
      },

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} event die Änderung des Phase-I-Feldes
       */
      async baselineCountChanged(event) {
        const v = parseInt(event.target.value, 10);
        // Leer, unlesbar oder < 1 heißt „alle Punkte" (E6).
        await this.setParam('baselineCount', Number.isInteger(v) && v >= 1 ? v : null);
        // Das Feld zeigt danach den Wert des Models (Projektform zu E6).
        event.target.value = this.model.baselineCount == null ? '' : String(this.model.baselineCount);
      },

      /** @noagent view transform; klappt die Regelliste, kein Zustand der Rechnung */
      toggleNelson() {
        this.nelsonCollapsed = !this.nelsonCollapsed;
      },

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {number|string} ruleId die Regel
       * @param {Event} event die Änderung ihres Kästchens
       */
      async toggleRule(ruleId, event) {
        const id = parseInt(ruleId, 10);
        const rest = this.model.enabledRules.filter(r => r !== id);
        await this.setParam('enabledRules', event.target.checked ? [...rest, id] : rest);
      },

      /** @noagent helper; Entprellen für Eingaben, die Setter rechnen sofort */
      scheduleAutoRun() {
        clearTimeout(this._autoRunTimer);
        this._autoRunTimer = setTimeout(() => this.runAnalysis(), AUTORUN_DELAY);
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      /**
       * Mit den aktuellen Eingaben und Spaltenwerten neu rechnen.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        clearTimeout(this._autoRunTimer);
        const analysis = analyzeState(this.model, (ref) => getColumnValues(module._context.stateManager, ref));
        if (!analysis) {
          this._destroyCharts();
          this.result = null;
          this._lastResult = null;
          return;
        }
        this._lastResult = analysis;
        this.result = analysis.result;
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderChart(analysis.result, analysis.violations, gen));
      },

      // ── SVG control chart (imperative via chartManager) ───────

      async _renderChart(result, violations, gen) {
        this._destroyCharts();
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (!plotEl) return;
        plotEl.replaceChildren();

        const violationIndices = new Set(violations.map(v => v.index));
        const baselineEnd = this.model.baselineCount && this.model.baselineCount < result.values.length
          ? this.model.baselineCount : null;

        const chart = await module._context.chartManager.create(plotEl, 'control-chart', {
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: _t(`yLabel_${  this.model.chartTypeId}`),
          showLegend: false,
          showTitle: false,
          values: result.values,
          cl: result.cl,
          ucl: result.ucl,
          lcl: result.lcl,
          sigma: result.sigma,
          violationIndices,
          baselineEnd,
          usl: null, lsl: null,
          showZones: !result.variableLimits,
        });
        if (gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
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

      // ── ColumnPickers (imperative widgets) ────────────────────

      _mountPickers() {
        const defWrap = module._container.querySelector('[data-ref="defects-picker"]');
        if (defWrap) {
          this._pickerDefects?.destroy();
          this._pickerDefects = new ColumnPicker(defWrap, module._context, {
            mode: 'single',
            ...SLOT_FILTERS.defects,
            onChange: (ref) => this.setColumn('defects', ref),
          });
          if (this.model.defectsRef) this._pickerDefects.value = this.model.defectsRef;
        }

        const sizeWrap = module._container.querySelector('[data-ref="size-picker"]');
        if (sizeWrap) {
          this._pickerSize?.destroy();
          this._pickerSize = new ColumnPicker(sizeWrap, module._context, {
            mode: 'single',
            ...SLOT_FILTERS.size,
            // Der Wähler ist nur bei p/u sichtbar; leeren darf er immer (E2).
            onChange: (ref) => this.setColumn('size', ref),
          });
          if (this.model.sizeRef) this._pickerSize.value = this.model.sizeRef;
        }
      },

      _destroyPickers() {
        if (this._pickerDefects) { this._pickerDefects.destroy(); this._pickerDefects = null; }
        if (this._pickerSize) { this._pickerSize.destroy(); this._pickerSize = null; }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      /** @noagent lifecycle */
      init() {
        this._charts = [];
        this._unsubs = [];

        this._mountPickers();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            this._pickerDefects?.refresh();
            this._pickerSize?.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        const onTheme = () => {
          if (this._lastResult) {
            this.$nextTick(() => this._renderChart(this._lastResult.result, this._lastResult.violations, ++this._renderGen));
          }
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
        clearTimeout(this._autoRunTimer);
        this._destroyPickers();
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: attribute-control-chart examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `defectsRef`/`sizeRef` instanceId. On load we provision a fresh worksheet,
 * rewrite the placeholder, then apply state (which re-runs the analysis on the
 * new data). This replaces the generic createModule loadExample because of the
 * worksheet provisioning the generic helper cannot perform.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['defectsRef', 'sizeRef']),
  });
};

export default mod;
