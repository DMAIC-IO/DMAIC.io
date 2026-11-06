/**
 * D.Mike — Hypothesis Test Module (hypothesis-test.js)
 * Analyze phase: guided hypothesis testing for variance and mean
 * with automatic normality assessment and algorithm routing.
 *
 * Migrated to createModule + Alpine CSP. The Model (hypothesis-test-model.js)
 * holds only the persistent configuration; the full analysis result is derived
 * transiently in the view from those inputs plus the live worksheet columns,
 * and exposed to the template as a single plain `result` object (no HTML built
 * in JS). The numbers come from `domain/analyze.js` (over the engines), the
 * display model from `viewmodel/present.js` — no statistics live here.
 *
 * ColumnPickers are mounted imperatively (one / two / multi depending on the
 * test type); they are not pure-template concerns.
 *
 * Workflow: configuration → normality → (variance check) → routed main test →
 * power analysis (non-k) / pairwise post-hoc (k ≥ 3).
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Testfamilie, Stichprobenlage,
 *   Richtung, α, Power-Ziel, Zielwert, Varianzannahme, Spaltenwahl und das
 *   Rechnen selbst. Gelesen wird über read() mit erklärter Lesefläche
 *   (AgentRead) — Konfiguration plus gerechnetes Ergebnis. Der Agent bekommt
 *   Zahlen, keine Diagramme.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireBoolean, requireEnum, requireNumber } from '../../core/agent/agent-argcheck.js';
import { paramInputMixin, numberCheck } from '../../core/param-input.js';
import {
  State, CATEGORIES, TEST_TYPES, DIRECTIONS, TARGET_TYPES, ALPHA_BOUNDS, POWER_GOAL_BOUNDS,
} from './hypothesis-test-model.js';
import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';
import { analyze, algoIdOf } from './domain/analyze.js';
import { presentResult, insufficientText, fmt } from './viewmodel/present.js';

/**
 * Zahlenfelder der Oberfläche; die Grenzen von α und Power sind dieselben wie
 * im Agent-Setter. Das Hypothesenziel hat keine Grenzen (leer = nicht gesetzt).
 */
const PARAM_SPEC = {
  alpha: { ...ALPHA_BOUNDS, step: 0.01 },
  powerGoal: { ...POWER_GOAL_BOUNDS, step: 0.05 },
  targetValue: { nullable: true },
};

/** Je Feld sein Prüfer; der Setter bleibt die einzige Schreibstelle. */
const PARAM_CHECKS = {
  alpha: numberCheck(PARAM_SPEC.alpha),
  powerGoal: numberCheck(PARAM_SPEC.powerGoal),
  targetValue: (v) => v,
};

/** Je Feld der Setter, über den die Oberfläche schreibt. */
const PARAM_SETTERS = { alpha: 'setAlpha', powerGoal: 'setPowerGoal', targetValue: 'setTargetValue' };

/** @typedef {import('./viewmodel/present.js').Result} Result */

/**
 * Die Agenten-Lesefläche des Hypothesentests.
 *
 * Nicht die persistierte Form: das Model hält NUR die Konfiguration, das
 * Ergebnis entsteht transient am Viewmodel (`result`). Verlangt ist
 * aber ausdrücklich, dass der Lesezustand die gerechneten Größen mitliefert —
 * „erklär mir diese Ausreißer" braucht keine eigene Aktion. Darum erklärt
 * dieses Modul seine Lesefläche: Konfiguration plus
 * Ergebnis, ohne die interne Beispiel-Buchführung (`exampleWorksheetId`).
 *
 * @typedef {object} AgentRead
 * @property {'variance'|'mean'} category  what is being tested: variance or mean
 * @property {'one'|'two'|'paired'|'k'} testType  one sample, two samples, paired samples, or k samples
 * @property {'two-sided'|'greater'|'less'} direction  the alternative hypothesis direction
 * @property {number|null} alpha  significance level, e.g. 0.05
 * @property {number|null} powerGoal  desired power, e.g. 0.8
 * @property {string} targetValue  the hypothesised target as entered (σ²₀, σ₀, μ₀ or μ_d₀)
 * @property {'variance'|'stddev'} targetType  how the one-sample variance target is entered
 * @property {object|null} colRef1  column reference of sample 1, `{ instanceId, sheetId, columnId }`
 * @property {object|null} colRef2  column reference of sample 2, same shape
 * @property {object[]} colRefsK  the column references of the k-sample test
 * @property {boolean} equalVariances  two- and k-sample means: assume equal variances (pooled t, Fisher ANOVA) instead of Welch
 * @property {Result|null} result  the computed result as a display model, or null while the inputs are incomplete
 */
const definition = {
  config: {
    id: 'hypothesis-test',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.hypothesis-test',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...paramInputMixin({
        specs: PARAM_SPEC,
        checks: PARAM_CHECKS,
        t: _t,
        lang: () => module._context?.i18n?.getLanguage?.() ?? 'de',
      }),
      // ── Transient view state (not persisted) ────────────────────
      result: null,
      errorText: '',
      _picker1: null,
      _picker2: null,
      _pickerK: null,
      _unsubs: [],

      fmt,

      // ── Hypothesis preview (input panel) ───────────────────────

      _sym0() {
        const d = this.model.direction;
        return d === 'two-sided' ? '=' : d === 'greater' ? '≤' : '≥';
      },
      _sym1() {
        const d = this.model.direction;
        return d === 'two-sided' ? '≠' : d === 'greater' ? '>' : '<';
      },

      /** @noagent view transform (hypothesis preview) */
      previewH0() {
        const isMean = this.model.category === 'mean';
        const isTwo = this.model.testType === 'two';
        const isK = this.model.testType === 'k';
        const s0 = this._sym0();
        if (isK) {
          return isMean
            ? 'H₀: μ₁ = μ₂ = … = μₖ'
            : 'H₀: σ²₁ = σ²₂ = … = σ²ₖ';
        }
        if (this.model.testType === 'paired') return `H₀: μ_d ${s0} μ_d₀`;
        if (!isMean) {
          return isTwo
            ? `H₀: σ²₁ ${s0} σ²₂`
            : `H₀: σ² ${s0} σ²₀`;
        }
        return isTwo
          ? `H₀: μ₁ ${s0} μ₂`
          : `H₀: μ ${s0} μ₀`;
      },

      /** @noagent view transform (hypothesis preview) */
      previewH1() {
        const isMean = this.model.category === 'mean';
        const isTwo = this.model.testType === 'two';
        const isK = this.model.testType === 'k';
        const s1 = this._sym1();
        if (isK) {
          return isMean ? `H₁: ${_t('kSampleH1')}` : `H₁: ${_t('kSampleVarH1')}`;
        }
        if (this.model.testType === 'paired') return `H₁: μ_d ${s1} μ_d₀`;
        if (!isMean) {
          return isTwo
            ? `H₁: σ²₁ ${s1} σ²₂`
            : `H₁: σ² ${s1} σ²₀`;
        }
        return isTwo
          ? `H₁: μ₁ ${s1} μ₂`
          : `H₁: μ ${s1} μ₀`;
      },

      // ── Input handlers ─────────────────────────────────────────

      /**
       * Choose what is being tested.
       * @agent
       * @param {'variance'|'mean'} cat the test family
       * @returns {void}
       * @throws {Error} if `cat` is neither 'variance' nor 'mean'
       */
      setCategory(cat) {
        requireEnum('category', cat, CATEGORIES);
        this.model.applyCategory(cat);
        this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });
      },
      /**
       * Choose the sample layout.
       * @agent
       * @param {'one'|'two'|'paired'|'k'} type one sample, two samples, paired samples, or k samples
       * @returns {void}
       * @throws {Error} if `type` is not one of 'one', 'two', 'paired', 'k'
       */
      setTestType(type) {
        requireEnum('testType', type, TEST_TYPES);
        this.model.applyTestType(type);
        this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });
      },
      /**
       * Set the alternative hypothesis direction.
       * @agent
       * @param {'two-sided'|'greater'|'less'} direction the alternative direction
       * @returns {void}
       * @throws {Error} if `direction` is not one of 'two-sided', 'greater',
       *   'less' — an unknown direction would be computed as 'less'
       */
      setDirection(direction) {
        requireEnum('direction', direction, DIRECTIONS);
        this.model.direction = direction;
        this.runAnalysis();
      },
      /**
       * Set the significance level α.
       * @agent
       * @param {number|string} alpha significance level, 0 < α < 1, e.g. 0.05
       * @returns {void}
       * @throws {Error} if `alpha` is not a number greater than 0 and less
       *   than 1 — the previous α stays
       */
      setAlpha(alpha) {
        this.model.alpha = requireNumber('alpha', alpha, ALPHA_BOUNDS);
        this.runAnalysis();
      },
      /**
       * Set the desired power for the sample-size assessment.
       * @agent
       * @param {number|string} powerGoal desired power, 0.5 to 0.99, e.g. 0.8
       * @returns {void}
       * @throws {Error} if `powerGoal` is not a number from 0.5 to 0.99 —
       *   the previous value stays (no clamping)
       */
      setPowerGoal(powerGoal) {
        this.model.powerGoal = requireNumber('powerGoal', powerGoal, POWER_GOAL_BOUNDS);
        this.runAnalysis();
      },
      /**
       * Set the hypothesised target (σ²₀, σ₀ or μ₀).
       * @agent
       * @param {string|number} value the target as entered
       * @returns {void}
       */
      setTargetValue(value) {
        this.model.targetValue = String(value ?? '');
        this.runAnalysis();
      },
      /**
       * Choose whether the one-sample variance target is a variance or a
       * standard deviation.
       * @agent
       * @param {'variance'|'stddev'} targetType how the target is entered
       * @returns {void}
       * @throws {Error} if `targetType` is neither 'variance' nor 'stddev'
       */
      setTargetType(targetType) {
        requireEnum('targetType', targetType, TARGET_TYPES);
        this.model.targetType = targetType;
        this.runAnalysis();
      },
      /**
       * Two- and k-sample means: assume equal variances (pooled t, Fisher
       * ANOVA with Tukey) instead of Welch.
       * @agent
       * @param {boolean} flag true to assume equal variances
       * @returns {void}
       * @throws {Error} wenn flag weder true noch false ist
       */
      setEqualVariances(flag) {
        this.model.equalVariances = requireBoolean('flag', flag);
        this.runAnalysis();
      },
      /**
       * Point sample 1 at a worksheet column.
       * @agent
       * @param {object|null} ref column reference `{ instanceId, sheetId, columnId }`, or null to clear
       * @returns {void}
       */
      setColumn1(ref) {
        this.model.colRef1 = ref;
        // Den Picker nachziehen, damit die UI zeigt, was der Agent gewählt
        // hat — und weil die Auswertung die Werte am Picker abholt.
        // `syncValue` statt `value`: der Setter endet in `_render()` und
        // ersetzt damit genau das `<select>`, dessen `change` uns gerade
        // hierher gebracht hat (Fokusverlust). `syncValue` tut bei
        // unveränderter Auswahl nichts und löst `onChange` nicht aus.
        this._picker1?.syncValue(ref);
        this.runAnalysis();
      },
      /**
       * Point sample 2 at a worksheet column.
       * @agent
       * @param {object|null} ref column reference `{ instanceId, sheetId, columnId }`, or null to clear
       * @returns {void}
       */
      setColumn2(ref) {
        this.model.colRef2 = ref;
        this._picker2?.syncValue(ref);
        this.runAnalysis();
      },
      /**
       * Point the k-sample test at a set of worksheet columns.
       * @agent
       * @param {object[]} refs column references, each `{ instanceId, sheetId, columnId }`
       * @returns {void}
       */
      setColumnsK(refs) {
        this.model.colRefsK = Array.isArray(refs) ? refs : [];
        this._pickerK?.syncValue(this.model.colRefsK);
        this.runAnalysis();
      },
      /** @noagent DOM event handler target; routes a checked numeric field to its agent setter */
      setParam(key, value) {
        const setter = PARAM_SETTERS[key];
        if (!setter) throw new Error(`unknown numeric field ${JSON.stringify(key)}`);
        this[setter](value);
      },

      // ── Algorithm Lab link ─────────────────────────────────────

      /** @noagent view transform (Algorithm-Lab id of the chosen route) */
      algoId: (name) => algoIdOf(name) ?? '',
      /** @noagent navigates to the Algorithm Lab page */
      algoNavigate(algoId, event) {
        event?.preventDefault();
        event?.stopPropagation();
        if (algoId && module._context?.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      },

      // ── Data retrieval (live worksheet) ────────────────────────

      _valuesForRef(ref) {
        const raw = getColumnValues(module._context.stateManager, ref);
        return raw.filter(v => v != null && typeof v === 'number' && !isNaN(v));
      },
      _refName(ref) {
        return getColumnName(module._context.stateManager, ref);
      },

      // ── Analysis controller ────────────────────────────────────

      /**
       * Run the analysis with the current configuration. Idempotent: it reads
       * the configuration and recomputes; incomplete inputs leave `result`
       * at null instead of failing.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        const analysis = analyze(this._analysisInput());
        if (analysis.status !== 'ok') {
          this.result = null;
          this.errorText = insufficientText(analysis, _t);
        } else {
          this.result = presentResult(analysis, _t, this.model);
          this.errorText = '';
        }
        this._renderResidualCharts();
      },

      /**
       * Die Eingabe der Analyse aus Model und Pickern: Konfiguration, das
       * aufgelöste Ziel und die Stichproben aus dem Arbeitsblatt. Gepaart
       * gehen die Spalten ungefiltert hinein, die Paarbildung dünnt selbst aus.
       * @returns {import('./domain/analyze.js').AnalysisInput}
       */
      _analysisInput() {
        const m = this.model;
        const sm = module._context.stateManager;
        const one = (picker) => picker?.value
          ? { name: this._refName(picker.value), values: this._valuesForRef(picker.value) }
          : { name: '', values: null };
        const raw = (picker) => ({ name: '', values: picker?.value ? getColumnValues(sm, picker.value) : null });
        let samples;
        if (m.testType === 'k') {
          samples = (this._pickerK?.value || []).map(ref => ({ name: this._refName(ref), values: this._valuesForRef(ref) }));
        } else if (m.testType === 'paired') {
          samples = [raw(this._picker1), raw(this._picker2)];
        } else if (m.testType === 'two') {
          samples = [one(this._picker1), one(this._picker2)];
        } else {
          samples = [one(this._picker1)];
        }
        return {
          category: m.category, testType: m.testType, direction: m.direction,
          alpha: m.alpha, powerGoal: m.powerGoal, target: m.resolveTarget(),
          targetType: m.targetType, equalVariances: m.equalVariances, samples,
        };
      },

      // ── Residual plots (one-way ANOVA routes) ─────────────────

      /** Destroys all residual chart instances created so far. */
      _destroyResidualCharts() {
        for (const ch of this._residualCharts || []) {
          if (ch && typeof ch.destroy === 'function') { try { ch.destroy(); } catch { /* ignore */ } }
        }
        this._residualCharts = [];
      },

      /**
       * Waits until an anchor element exists in the module container (the
       * residual block lives in an x-if and appears one tick after the result).
       * Resolves null when a newer render superseded this one or the anchor never came.
       * @param {string} selector
       * @param {number} gen - render generation the caller belongs to
       * @param {number} [maxFrames]
       * @returns {Promise<Element|null>}
       */
      _whenResidualAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._residualGen) { resolve(null); return; }
            const el = module._container?.querySelector(selector);
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      /**
       * Destroys the previous residual charts and, when the current result
       * carries residuals (Fisher / Welch route), renders the four-in-one block
       * through chartManager. Residuals are standardized by their sample
       * standard deviation, as in the regression module. Stores the pending
       * promise in `_residualRender` so callers (and tests) can await it.
       * @returns {Promise<void>}
       */
      _renderResidualCharts() {
        this._residualGen = (this._residualGen || 0) + 1;
        const gen = this._residualGen;
        this._destroyResidualCharts();
        const plot = this.result?.residualPlot;
        const chartManager = module._context?.chartManager;
        if (!plot || !chartManager) { this._residualRender = Promise.resolve(); return this._residualRender; }

        const { residuals, fitted } = plot;
        const n = residuals.length;
        const mean = residuals.reduce((a, v) => a + v, 0) / n;
        const sd = Math.sqrt(residuals.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
        const standardized = residuals.map(v => (sd > 0 ? (v - mean) / sd : 0));
        const order = residuals.map((_, i) => i + 1);
        const zeroLine = [{ dir: 'h', value: 0, dash: 'dash', width: 1, color: 'var(--color-error)', label: '0' }];
        const dot = (color, x, y) => ({
          name: _t('residuals'), color, markerSize: 4, strokeWidth: 0.75, symbol: 'circle', x, y,
        });

        const charts = [
          ['chart-resid-fits', 'scatter', {
            title: _t('residualsVsFitted'), xLabel: _t('fittedValues'), yLabel: _t('residuals'),
            showLegend: false, refLines: zeroLine, series: [dot('var(--color-chart-3)', fitted, residuals)],
          }],
          ['chart-resid-normal', 'probability-plot', {
            title: _t('residualsNormalPlot'), xLabel: _t('residuals'), yLabel: _t('residualsPercent'),
            showLegend: false,
            series: [{ name: _t('residuals'), values: standardized, color: 'var(--color-chart-5)' }],
          }],
          ['chart-resid-hist', 'histogram', {
            title: _t('residualsHistogram'), xLabel: _t('residuals'), yLabel: _t('residualsFrequency'),
            showLegend: false, showNormalCurve: true, data: residuals,
          }],
          ['chart-resid-order', 'scatter', {
            title: _t('residualsVsOrder'), xLabel: _t('residualsVsOrderByGroup'), yLabel: _t('residuals'),
            showLegend: false, refLines: zeroLine, series: [dot('var(--color-chart-4)', order, residuals)],
          }],
        ];

        const render = async () => {
          await new Promise(resolve => this.$nextTick(resolve));
          await Promise.all(charts.map(async ([ref, type, config]) => {
            const el = await this._whenResidualAnchor(`[data-ref="${ref}"]`, gen);
            if (!el) return;
            el.replaceChildren();
            const chart = await chartManager.create(el, type, { editKey: `hyptest:${ref}`, ...config });
            if (!chart) return;
            if (gen !== this._residualGen) { try { chart.destroy(); } catch { /* ignore */ } return; }
            this._residualCharts.push(chart);
          }));
        };
        this._residualRender = render();
        return this._residualRender;
      },

      // ── ColumnPickers (imperative widgets) ─────────────────────

      _remountPickers() {
        this._disposePickers();
        const ctx = module._context;
        const c = module._container;

        const wrap1 = c.querySelector('[data-ref="picker1-wrap"]');
        if (wrap1) {
          this._picker1 = new ColumnPicker(wrap1, ctx, {
            mode: 'single', types: ['numeric'], minCount: 3,
            onChange: (ref) => this.setColumn1(ref),
          });
          if (this.model.colRef1) this._picker1.value = this.model.colRef1;
        }

        const wrap2 = c.querySelector('[data-ref="picker2-wrap"]');
        if (wrap2) {
          this._picker2 = new ColumnPicker(wrap2, ctx, {
            mode: 'single', types: ['numeric'], minCount: 3,
            onChange: (ref) => this.setColumn2(ref),
          });
          if (this.model.colRef2) this._picker2.value = this.model.colRef2;
        }

        const wrapK = c.querySelector('[data-ref="picker-k-wrap"]');
        if (wrapK) {
          this._pickerK = new ColumnPicker(wrapK, ctx, {
            mode: 'multi', types: ['numeric'], minCount: 3,
            onChange: (refs) => this.setColumnsK(refs),
          });
          if (this.model.colRefsK?.length) this._pickerK.value = this.model.colRefsK;
        }
      },

      _disposePickers() {
        this._picker1?.destroy(); this._picker1 = null;
        this._picker2?.destroy(); this._picker2 = null;
        this._pickerK?.destroy(); this._pickerK = null;
      },

      // ── Lifecycle ──────────────────────────────────────────────

      /** @noagent per-instance lifecycle */
      init() {
        this._unsubs = [];

        // Seed alpha / powerGoal from global settings when not yet set.
        const sm = module._context.stateManager;
        const globalConf = (sm.get('settings.confidenceLevel') ?? 95) / 100;
        const globalPower = (sm.get('settings.power') ?? 80) / 100;
        if (this.model.alpha == null) this.model.alpha = Number((1 - globalConf).toFixed(4));
        if (this.model.powerGoal == null) this.model.powerGoal = globalPower;

        // Pickers live inside x-if blocks → their wrappers exist only after
        // Alpine has processed the tree, so mount on the next tick.
        this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            this._picker1?.refresh(); this._picker2?.refresh(); this._pickerK?.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        this.runAnalysis();
      },

      /** @noagent per-instance lifecycle */
      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._residualGen = (this._residualGen || 0) + 1;
        this._destroyResidualCharts();
        this._disposePickers();
      },

      // ── Agentenfläche ──────────────────────────────────────────

      /**
       * Konfiguration und gerechnetes Ergebnis als Lesezustand.
       *
       * `result` ist `null`, solange die Eingaben unvollständig sind (zu
       * wenige Werte, kein gültiger Zielwert) — genau dann zeigt die UI auch
       * nichts an.
       *
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} configuration plus the computed result
       */
      read(options) {
        // `this.result` ist ein reaktiver Proxy. Die Kopie dafür macht
        // `clone()` in agent-read.js (structuredClone scheitert am Proxy,
        // die JSON-Runde fängt ihn) — eine zweite Kopie hier wäre ein
        // zweiter Weg für dieselbe Sache.
        return readAgentState(
          'hypothesis-test',
          { ...this.model.toJSON(), result: this.result },
          options,
        );
      },
    };
  },
};

const mod = createModule(definition);

/**
 * The view's data factory, exported so unit tests can drive the analysis
 * without mounting the template (pickers and column lookups are stubbed).
 * @type {(module: object, t: (key: string, params?: object) => string) => object}
 */
export const viewData = definition.data;

/**
 * Custom loadExample: hypothesis-test catalog examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `instanceId` of every column ref (`colRef1`, `colRef2`, each `colRefsK[]`).
 * On load we provision a fresh worksheet, rewrite the placeholders, then apply
 * state (re-running the analysis on the new data).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, from, to) {
      const rewrite = (r) => (r && r.instanceId === from) ? { ...r, instanceId: to } : r;
      const out = { ...data };
      if (out.colRef1) out.colRef1 = rewrite(out.colRef1);
      if (out.colRef2) out.colRef2 = rewrite(out.colRef2);
      if (Array.isArray(out.colRefsK)) out.colRefsK = out.colRefsK.map(rewrite);
      return out;
    },
  });
};

export default mod;
