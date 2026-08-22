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
 */

import { createModule } from '../../core/template-module.js';
import { State } from './attribute-control-chart-model.js';

import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';

import {
  getAttributeChartType,
  ATTRIBUTE_NELSON_RULES,
  evaluateAttributeRules,
} from '../../engines/attribute-control-chart-engine.js';

import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';

/** Auto-run debounce delay (ms) — matches the legacy module. */
const AUTORUN_DELAY = 120;

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

      // ── View transformations ──────────────────────────────────

      requiresSampleSize() {
        const ct = getAttributeChartType(this.model.chartTypeId);
        return Boolean(ct?.requiresSampleSize);
      },
      requiresConstantN() {
        const ct = getAttributeChartType(this.model.chartTypeId);
        return Boolean(ct?.requiresConstantN);
      },

      nelsonRuleShort(rule) {
        const lang = module._context.language || 'de';
        return rule.short[lang] || rule.short.de;
      },
      nelsonRuleDesc(rule) {
        const lang = module._context.language || 'de';
        return rule.desc[lang] || rule.desc.de;
      },

      // ── Stats KPI strip (derived from this.result) ────────────

      _meanArr(a) {
        return Array.isArray(a) ? a.reduce((s, x) => s + x, 0) / Math.max(1, a.length) : a;
      },
      fmtCL() {
        const r = this.result;
        return r && Number.isFinite(r.cl) ? r.cl.toFixed(4) : '–';
      },
      uclMeanStr() {
        const r = this.result;
        return r ? this._meanArr(r.ucl).toFixed(3) : '';
      },
      lclMeanStr() {
        const r = this.result;
        return r ? this._meanArr(r.lcl).toFixed(3) : '';
      },
      limitsLabel() {
        const r = this.result;
        return r && r.variableLimits ? 'UCL̄ / LCL̄' : 'UCL / LCL';
      },
      /** Unique-index violation count (matches legacy stat). */
      violationCount() {
        return new Set((this._lastResult?.violations || []).map(v => v.index)).size;
      },
      validCount() {
        return this._lastResult?.valid ?? 0;
      },

      // ── Chart header (badge uses RAW violation count, like legacy) ──

      chartTitle() {
        const colName = getColumnName(module._context.stateManager, this.model.defectsRef);
        return _t(`subchart_${  this.model.chartTypeId}`, { col: colName });
      },
      isStable() {
        return (this._lastResult?.violations || []).length === 0;
      },
      badgeText() {
        const violations = this._lastResult?.violations || [];
        return violations.length === 0
          ? _t('stable')
          : _t('unstable', { count: violations.length });
      },
      badgeIcon() {
        return this.isStable() ? 'status.ok' : 'status.warning';
      },

      // ── Violations panel (unique index-ruleId pairs, sorted) ──

      violationRows() {
        const violations = this._lastResult?.violations || [];
        const lang = module._context.language || 'de';
        const unique = [];
        const seen = new Set();
        violations.forEach(v => {
          const k = `${v.index}-${v.ruleId}`;
          if (!seen.has(k)) { seen.add(k); unique.push(v); }
        });
        unique.sort((a, b) => a.index - b.index);
        return unique.map(v => {
          const rule = ATTRIBUTE_NELSON_RULES.find(r => r.id === v.ruleId);
          return {
            index: v.index,
            ruleId: v.ruleId,
            desc: rule ? (rule.short[lang] || rule.short.de) : '',
          };
        });
      },
      violationsHeader() {
        const count = this.violationRows().length;
        return `⚑ ${  _t('violationsTitle', { count })}`; // ⚑
      },

      // ── Event handlers ─────────────────────────────────────────

      chartTypeChanged() {
        // x-show toggles the size/constant-n rows automatically; just re-run.
        this.scheduleAutoRun();
      },

      constantNChanged(event) {
        const v = parseInt(event.target.value, 10);
        this.model.constantN = (Number.isFinite(v) && v > 0) ? v : 50;
        this.scheduleAutoRun();
      },

      baselineCountChanged(event) {
        const val = parseInt(event.target.value, 10);
        this.model.baselineCount = isNaN(val) ? null : val;
        this.scheduleAutoRun();
      },

      toggleNelson() {
        this.nelsonCollapsed = !this.nelsonCollapsed;
      },

      toggleRule(ruleId, event) {
        const id = parseInt(ruleId, 10);
        if (event.target.checked) {
          if (!this.model.enabledRules.includes(id)) this.model.enabledRules.push(id);
        } else {
          this.model.enabledRules = this.model.enabledRules.filter(r => r !== id);
        }
        this.scheduleAutoRun();
      },

      scheduleAutoRun() {
        clearTimeout(this._autoRunTimer);
        this._autoRunTimer = setTimeout(() => this.runAnalysis(), AUTORUN_DELAY);
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      readNumericColumn(ref) {
        const raw = getColumnValues(module._context.stateManager, ref);
        return raw.map(v => (typeof v === 'number' && !isNaN(v)) ? v : null);
      },

      runAnalysis() {
        const clear = () => {
          this._destroyCharts();
          this.result = null;
          this._lastResult = null;
        };

        if (!this.model.defectsRef) return clear();

        const ct = getAttributeChartType(this.model.chartTypeId);
        if (!ct) return clear();

        const defectsRaw = this.readNumericColumn(this.model.defectsRef);
        const typeId = this.model.chartTypeId;
        const baselineEnd = this.model.baselineCount;

        let result, n, valid;
        try {
          if (typeId === 'p' || typeId === 'u') {
            if (!this.model.sizeRef) return clear();
            const sizesRaw = this.readNumericColumn(this.model.sizeRef);
            const pairs = [];
            const len = Math.min(defectsRaw.length, sizesRaw.length);
            for (let i = 0; i < len; i++) {
              if (defectsRaw[i] != null && sizesRaw[i] != null && sizesRaw[i] > 0) {
                pairs.push([defectsRaw[i], sizesRaw[i]]);
              }
            }
            if (pairs.length < 2) return clear();
            const defects = pairs.map(p => p[0]);
            const sizes = pairs.map(p => p[1]);
            result = ct.compute({ defects, n: sizes, baselineEnd });
            n = sizes;
            valid = pairs.length;
          } else if (typeId === 'np') {
            const defects = defectsRaw.filter(v => v != null);
            if (defects.length < 2) return clear();
            result = ct.compute({ defects, n: this.model.constantN, baselineEnd });
            n = result.n;
            valid = defects.length;
          } else { // c
            const defects = defectsRaw.filter(v => v != null);
            if (defects.length < 2) return clear();
            result = ct.compute({ defects, baselineEnd });
            n = null;
            valid = defects.length;
          }
        } catch (err) {
          console.error('attribute-control-chart compute error', err);
          return clear();
        }

        const violations = evaluateAttributeRules(
          result.values, result.cl, result.ucl, result.lcl, result.sigma, this.model.enabledRules,
        );

        this._lastResult = { result, ct, violations, n, valid };
        this.result = result;

        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderChart(result, violations, gen));
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
            types: ['numeric'],
            minCount: 2,
            onChange: (ref) => {
              this.model.defectsRef = ref;
              this.scheduleAutoRun();
            },
          });
          if (this.model.defectsRef) this._pickerDefects.value = this.model.defectsRef;
        }

        const sizeWrap = module._container.querySelector('[data-ref="size-picker"]');
        if (sizeWrap) {
          this._pickerSize?.destroy();
          this._pickerSize = new ColumnPicker(sizeWrap, module._context, {
            mode: 'single',
            types: ['numeric'],
            minCount: 2,
            onChange: (ref) => {
              this.model.sizeRef = ref;
              this.scheduleAutoRun();
            },
          });
          if (this.model.sizeRef) this._pickerSize.value = this.model.sizeRef;
        }
      },

      _destroyPickers() {
        if (this._pickerDefects) { this._pickerDefects.destroy(); this._pickerDefects = null; }
        if (this._pickerSize) { this._pickerSize.destroy(); this._pickerSize = null; }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

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
