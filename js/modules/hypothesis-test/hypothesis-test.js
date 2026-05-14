/**
 * D.Mike — Hypothesis Test Module (hypothesis-test.js)
 * Analyze phase: guided hypothesis testing for variance and mean
 * with automatic normality assessment and algorithm routing.
 *
 * Workflow (stepper):
 *   1. Configuration  — category, test type, data, targets, direction, α
 *   2. Normality      — Shapiro-Wilk + Anderson-Darling auto-check
 *   3. Variance Check — (two-sample mean only) F-Test or Levene
 *   4. Main Test      — routed test result with decision
 *   5. Power Analysis — power curve, required n, interactive slider
 *
 * Data source: column from Worksheet (via shared ColumnPicker) or manual textarea.
 */

import {
  chiSquareVarianceTest, fTest, leveneTest,
  oneSampleTTest, twoSampleTTest, welchTTest,
  wilcoxonSignedRank, mannWhitneyU,
  oneWayANOVA, leveneTestK, kruskalWallis, bartlettTest,
  powerChiSquare, powerFTest, powerOneSampleT, powerTwoSampleT,
  findRequiredN,
} from '../../engines/hypothesis-test-engine.js';

import { shapiroWilk, andersonDarling, descriptiveStats } from '../../engines/normality-test-engine.js';
import { tInv, chi2Inv } from '../../engines/math-utils.js';
import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { esc } from '../../core/html-utils.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

/** Mapping: test name → Algorithm Lab ID. */
const ALGO_LAB_IDS = {
  'Shapiro-Wilk': 'shapiro-wilk',
  'Anderson-Darling': 'anderson-darling',
  'Chi-Square Variance Test': 'chi-square-variance',
  'F-Test': 'f-test',
  'Levene Test (Brown-Forsythe)': 'levene-test',
  'One-Sample t-Test': 'one-sample-t-test',
  'Two-Sample t-Test (pooled)': 'two-sample-t-test',
  'Welch t-Test': 'welch-t-test',
  'Wilcoxon Signed-Rank Test': 'wilcoxon-signed-rank',
  'Mann-Whitney U Test': 'mann-whitney-u',
  'One-Way ANOVA': 'one-way-anova',
  'Kruskal-Wallis Test': 'kruskal-wallis',
  "Bartlett's Test": 'bartlett-test',
};

const ALGO_LINK_SVG = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

function fmt(v, d = 4) { return v != null && isFinite(v) ? v.toFixed(d) : '\u2013'; }

function algoLink(name, eventBus) {
  const id = ALGO_LAB_IDS[name];
  if (!id) return esc(name);
  return `${esc(name)} <button class="hyptest__algo-link" data-algo-id="${id}" title="Algorithm Lab">${ALGO_LINK_SVG}</button>`;
}

export default {
  id: 'hypothesis-test',
  phase: 'analyze',
  icon: 'check-circle',
  i18nKey: 'modules.hypothesis-test',
  version: '1.0.0',

  _container: null,
  _context: null,
  _eventUnsubs: [],

  // State
  _category: 'variance',  // 'variance' | 'mean'
  _testType: 'one',       // 'one' | 'two' | 'k'
  _direction: 'two-sided',
  _alpha: null,
  _powerGoal: null,
  _targetValue: '',
  _targetType: 'variance', // for variance: 'variance' | 'stddev'

  // Column pickers (ColumnPicker instances)
  _picker1: null,
  _picker2: null,
  _pickerK: null,
  _colRef1: null,
  _colRef2: null,
  _colRefsK: [],

  // Worksheet provisioned by loadExample; tracked so the next example load can
  // remove the previous one instead of leaving orphans in the data phase.
  _exampleWorksheetId: null,

  // Runtime analysis results (not persisted fully)
  _normality: null,
  _varEquality: null,
  _algoRoute: null,
  _result: null,

  help: () => import('./hypothesis-test-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._category = saved.category || 'variance';
      this._testType = saved.testType || 'one';
      this._direction = saved.direction || 'two-sided';
      this._alpha = saved.alpha ?? null;
      this._powerGoal = saved.powerGoal ?? null;
      this._targetValue = saved.targetValue || '';
      this._targetType = saved.targetType || 'variance';
      this._colRef1 = saved.colRef1 || null;
      this._colRef2 = saved.colRef2 || null;
      this._colRefsK = Array.isArray(saved.colRefsK) ? saved.colRefsK : [];
      if (saved.exampleWorksheetId !== undefined) this._exampleWorksheetId = saved.exampleWorksheetId;
    }

    const globalConf = (context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
    const globalPower = (context.stateManager.get('settings.power') ?? 80) / 100;
    if (this._alpha == null) this._alpha = +(1 - globalConf).toFixed(4);
    if (this._powerGoal == null) this._powerGoal = globalPower;

    this._render();
  },

  async destroy() {
    if (this._picker1) { this._picker1.destroy(); this._picker1 = null; }
    if (this._picker2) { this._picker2.destroy(); this._picker2 = null; }
    if (this._pickerK) { this._pickerK.destroy(); this._pickerK = null; }
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    this._container.innerHTML = '';
  },

  onLanguageChange() { this._render(); },
  onThemeChange() {},

  getState() {
    return {
      category: this._category,
      testType: this._testType,
      direction: this._direction,
      alpha: this._alpha,
      powerGoal: this._powerGoal,
      targetValue: this._targetValue,
      targetType: this._targetType,
      colRef1: this._picker1?.value || this._colRef1 || null,
      colRef2: this._picker2?.value || this._colRef2 || null,
      colRefsK: this._pickerK?.value || this._colRefsK || [],
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (!data) return;
    if (data.category) this._category = data.category;
    if (data.testType) this._testType = data.testType;
    if (data.direction) this._direction = data.direction;
    if (data.alpha != null) this._alpha = data.alpha;
    if (data.powerGoal != null) this._powerGoal = data.powerGoal;
    if (data.targetValue != null) this._targetValue = data.targetValue;
    if (data.targetType) this._targetType = data.targetType;
    if (data.colRef1 !== undefined) this._colRef1 = data.colRef1;
    if (data.colRef2 !== undefined) this._colRef2 = data.colRef2;
    if (data.colRefsK !== undefined) this._colRefsK = Array.isArray(data.colRefsK) ? data.colRefsK : [];
    if (data.exampleWorksheetId !== undefined) this._exampleWorksheetId = data.exampleWorksheetId;
    if (this._container) this._render();
  },

  /**
   * Load a catalog example. Source-Worksheet pattern: provision the included
   * worksheet, rewrite `__source__` placeholders in all column refs, then apply.
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!(this._colRef1 || this._colRef2 || (this._colRefsK && this._colRefsK.length));
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    const data = { ...payload.data };

    if (data.sourceWorksheetData) {
      const wsState = data.sourceWorksheetData;
      delete data.sourceWorksheetData;
      if (this._exampleWorksheetId) {
        removeProvisionedWorksheet(this._context, this._exampleWorksheetId);
        this._exampleWorksheetId = null;
      }
      const ref = provisionWorksheet(this._context, wsState);
      if (ref) {
        this._exampleWorksheetId = ref.instanceId;
        data.exampleWorksheetId = ref.instanceId;
        const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId: ref.instanceId } : r;
        if (data.colRef1) data.colRef1 = rewrite(data.colRef1);
        if (data.colRef2) data.colRef2 = rewrite(data.colRef2);
        if (Array.isArray(data.colRefsK)) data.colRefsK = data.colRefsK.map(rewrite);
      }
    }

    this.setState(data);
    this._save();

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Column Picker helpers ───────────────────────────────────

  /** Read numeric values from a picker's selected column. */
  _getPickerValues(picker) {
    if (!picker?.value) return [];
    const raw = getColumnValues(this._context.stateManager, picker.value);
    return raw.filter(v => v != null && typeof v === 'number' && !isNaN(v));
  },

  // ─── Translation helper ─────────────────────────────────────

  _t(k, v) { return this._context.i18n.t(`modules.hypothesis-test.${k}`, v); },

  // ─── Main Render ────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._t(k, v);
    this._normality = null;
    this._varEquality = null;
    this._result = null;

    // Destroy old pickers before re-rendering
    if (this._picker1) { this._picker1.destroy(); this._picker1 = null; }
    if (this._picker2) { this._picker2.destroy(); this._picker2 = null; }
    if (this._pickerK) { this._pickerK.destroy(); this._pickerK = null; }

    this._container.innerHTML = `
      <div class="hyptest dmike-split">
        <div class="hyptest__input dmike-split__input">
          ${this._renderConfig(t)}
        </div>
        <div class="hyptest__output dmike-split__output">
          <div class="hyptest__placeholder" data-ref="placeholder">
            <svg width="64" height="64" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
            <p>${t('placeholderText')}</p>
          </div>
          <div data-ref="results" style="display:none"></div>
        </div>
      </div>
    `;

    this._initPickers();
    this._bindConfigEvents(t);
  },

  // ─── Config Panel (left side) ───────────────────────────────

  _renderConfig(t) {
    const isMean = this._category === 'mean';
    const isTwo = this._testType === 'two';
    const isK = this._testType === 'k';

    // Hypothesis preview
    const dir = this._direction;
    const sym0 = dir === 'two-sided' ? '=' : dir === 'greater' ? '\u2264' : '\u2265';
    const sym1 = dir === 'two-sided' ? '\u2260' : dir === 'greater' ? '>' : '<';
    let h0, h1;
    if (isK) {
      if (isMean) {
        h0 = `H\u2080: \u03BC\u2081 = \u03BC\u2082 = \u2026 = \u03BC\u2096`;
        h1 = `H\u2081: ${t('kSampleH1')}`;
      } else {
        h0 = `H\u2080: \u03C3\u00B2\u2081 = \u03C3\u00B2\u2082 = \u2026 = \u03C3\u00B2\u2096`;
        h1 = `H\u2081: ${t('kSampleVarH1')}`;
      }
    } else if (!isMean) {
      h0 = isTwo ? `H\u2080: \u03C3\u00B2\u2081 ${sym0} \u03C3\u00B2\u2082` : `H\u2080: \u03C3\u00B2 ${sym0} \u03C3\u00B2\u2080`;
      h1 = isTwo ? `H\u2081: \u03C3\u00B2\u2081 ${sym1} \u03C3\u00B2\u2082` : `H\u2081: \u03C3\u00B2 ${sym1} \u03C3\u00B2\u2080`;
    } else {
      h0 = isTwo ? `H\u2080: \u03BC\u2081 ${sym0} \u03BC\u2082` : `H\u2080: \u03BC ${sym0} \u03BC\u2080`;
      h1 = isTwo ? `H\u2081: \u03BC\u2081 ${sym1} \u03BC\u2082` : `H\u2081: \u03BC ${sym1} \u03BC\u2080`;
    }

    return `
      <div class="dmike-split__section-title">${t('sectionCategory')}</div>
      <div class="btn-group hyptest__toggle-row">
        <button class="btn--segment hyptest__toggle-btn${this._category === 'variance' ? ' btn--active' : ''}" data-cat="variance">\u03C3\u00B2 ${t('catVariance')}</button>
        <button class="btn--segment hyptest__toggle-btn${this._category === 'mean' ? ' btn--active' : ''}" data-cat="mean">\u03BC ${t('catMean')}</button>
      </div>

      <div class="dmike-split__section-title">${t('sectionTestType')}</div>
      <div class="btn-group hyptest__toggle-row">
        <button class="btn--segment hyptest__toggle-btn${this._testType === 'one' ? ' btn--active' : ''}" data-type="one">${t('oneSample')}</button>
        <button class="btn--segment hyptest__toggle-btn${this._testType === 'two' ? ' btn--active' : ''}" data-type="two">${t('twoSample')}</button>
        <button class="btn--segment hyptest__toggle-btn${isK ? ' btn--active' : ''}" data-type="k">${t('kSample')}</button>
      </div>

      <div class="dmike-split__section-title">${t('sectionData')}</div>
      ${isK ? `
        <div class="field-group">
          <label>${t('kSampleColumns')}</label>
          <div data-ref="picker-k-wrap"></div>
        </div>
      ` : `
        <div class="field-group">
          <label>${t('sample1Column')}</label>
          <div data-ref="picker1-wrap"></div>
        </div>
        ${isTwo ? `
          <div class="field-group">
            <label>${t('sample2Column')}</label>
            <div data-ref="picker2-wrap"></div>
          </div>
        ` : ''}
      `}

      ${!isTwo && !isK ? `
        <div class="dmike-split__section-title">${isMean ? t('targetMean') : t('targetVariance')}</div>
        ${!isMean ? `
          <div class="field-row">
            <div class="hyptest__field field-group field-group--major">
              <label>${t('inputAs')}</label>
              <select data-ref="target-type" class="field">
                <option value="variance" ${this._targetType === 'variance' ? 'selected' : ''}>${t('asVariance')}</option>
                <option value="stddev" ${this._targetType === 'stddev' ? 'selected' : ''}>${t('asStddev')}</option>
              </select>
            </div>
            <div class="hyptest__field field-group field-group--minor">
              <label>\u03C3\u00B2\u2080</label>
              <input type="number" data-ref="target" class="field field--num" value="${esc(String(this._targetValue))}" placeholder="${t('targetVarPh')}">
            </div>
          </div>
        ` : `
          <div class="field-group">
            <label>\u03BC\u2080</label>
            <input type="number" data-ref="target" class="field field--num" value="${esc(String(this._targetValue))}" placeholder="${t('targetMeanPh')}">
          </div>
        `}
      ` : ''}

      <div class="dmike-split__section-title">${t('sectionHypothesis')}</div>
      <div class="field-row">
        ${isK ? '' : `
          <div class="hyptest__field field-group field-group--major">
            <label>${t('direction')}</label>
            <select data-ref="direction" class="field">
              <option value="two-sided" ${this._direction === 'two-sided' ? 'selected' : ''}>\u2260 ${t('twoSided')}</option>
              <option value="greater" ${this._direction === 'greater' ? 'selected' : ''}>&gt; ${t('greater')}</option>
              <option value="less" ${this._direction === 'less' ? 'selected' : ''}>&lt; ${t('less')}</option>
            </select>
          </div>
        `}
        <div class="hyptest__field field-group field-group--minor">
          <label>\u03B1</label>
          <input type="number" data-ref="alpha" class="field field--num" min="0.001" max="0.5" value="${this._alpha}">
        </div>
        ${isK ? '' : `
          <div class="hyptest__field field-group field-group--minor">
            <label>${t('powerGoal')}</label>
            <input type="number" data-ref="power-goal" class="field field--num" min="0.5" max="0.99" value="${this._powerGoal}">
          </div>
        `}
      </div>

      <div class="hyptest__hypothesis-preview field-row">
        <div class="hyptest__h-box"><span class="hyptest__h-label">H\u2080</span><span class="hyptest__h-formula">${h0}</span></div>
        <div class="hyptest__h-box"><span class="hyptest__h-label">H\u2081</span><span class="hyptest__h-formula">${h1}</span></div>
      </div>

      <div class="hyptest__error" data-ref="error-box"></div>
    `;
  },

  /** Create ColumnPicker instances after DOM is ready. */
  _initPickers() {
    const wrap1 = this._container.querySelector('[data-ref="picker1-wrap"]');
    if (wrap1) {
      this._picker1 = new ColumnPicker(wrap1, this._context, {
        mode: 'single',
        types: ['numeric'],
        minCount: 3,
        onChange: (ref) => {
          this._colRef1 = ref;
          this._save();
          this._runAnalysis();
        },
      });
      if (this._colRef1) this._picker1.value = this._colRef1;
    }

    const wrap2 = this._container.querySelector('[data-ref="picker2-wrap"]');
    if (wrap2) {
      this._picker2 = new ColumnPicker(wrap2, this._context, {
        mode: 'single',
        types: ['numeric'],
        minCount: 3,
        onChange: (ref) => {
          this._colRef2 = ref;
          this._save();
          this._runAnalysis();
        },
      });
      if (this._colRef2) this._picker2.value = this._colRef2;
    }

    const wrapK = this._container.querySelector('[data-ref="picker-k-wrap"]');
    if (wrapK) {
      this._pickerK = new ColumnPicker(wrapK, this._context, {
        mode: 'multi',
        types: ['numeric'],
        minCount: 3,
        onChange: (refs) => {
          this._colRefsK = refs;
          this._save();
          this._runAnalysis();
        },
      });
      if (this._colRefsK?.length) this._pickerK.value = this._colRefsK;
    }
  },

  _bindConfigEvents() {
    const c = this._container;

    // Category toggle
    c.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._category = btn.dataset.cat;
        this._save();
        this._render();
      });
    });

    // Test type toggle
    c.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._testType = btn.dataset.type;
        this._save();
        this._render();
      });
    });

    const autoCalc = () => { this._save(); this._runAnalysis(); };

    // Direction — re-renders hypothesis preview, then auto-calcs
    const dirSel = c.querySelector('[data-ref="direction"]');
    if (dirSel) dirSel.addEventListener('change', () => { this._direction = dirSel.value; this._save(); this._render(); });

    // Alpha
    const alphaInp = c.querySelector('[data-ref="alpha"]');
    if (alphaInp) alphaInp.addEventListener('input', () => { this._alpha = parseFloat(alphaInp.value) || this._alpha; autoCalc(); });

    // Power goal
    const pgInp = c.querySelector('[data-ref="power-goal"]');
    if (pgInp) pgInp.addEventListener('input', () => { this._powerGoal = Math.min(0.99, Math.max(0.5, parseFloat(pgInp.value) || this._powerGoal)); autoCalc(); });

    // Target type
    const ttSel = c.querySelector('[data-ref="target-type"]');
    if (ttSel) ttSel.addEventListener('change', () => { this._targetType = ttSel.value; autoCalc(); });

    // Target value
    const tgt = c.querySelector('[data-ref="target"]');
    if (tgt) tgt.addEventListener('input', () => { this._targetValue = tgt.value; autoCalc(); });

    // Auto-calculate if inputs are already present (e.g. restored state)
    this._runAnalysis();
  },

  // ─── Data Retrieval ─────────────────────────────────────────

  _getData1() {
    return this._getPickerValues(this._picker1);
  },

  _getData2() {
    return this._getPickerValues(this._picker2);
  },

  /** Read numeric arrays for the multi-column picker (k-sample). */
  _getDataK() {
    const refs = this._pickerK?.value || [];
    return refs.map(ref => {
      const raw = getColumnValues(this._context.stateManager, ref);
      return raw.filter(v => v != null && typeof v === 'number' && !isNaN(v));
    });
  },

  /** Display name for a column ref (label for k-sample groups). */
  _refName(ref) {
    return getColumnName(this._context.stateManager, ref);
  },

  // ─── Analysis ───────────────────────────────────────────────

  _hideResults() {
    const resEl = this._container.querySelector('[data-ref="results"]');
    const phEl = this._container.querySelector('[data-ref="placeholder"]');
    if (resEl) resEl.style.display = 'none';
    if (phEl) phEl.style.display = '';
  },

  _runAnalysis() {
    const errBox = this._container.querySelector('[data-ref="error-box"]');
    errBox.textContent = '';
    errBox.style.display = 'none';

    if (this._testType === 'k') {
      this._runAnalysisK();
      return;
    }

    const d1 = this._getData1();
    if (d1.length < 3) { this._hideResults(); return; }

    let d2 = null;
    if (this._testType === 'two') {
      d2 = this._getData2();
      if (d2.length < 3) { this._hideResults(); return; }
    }

    let target = null;
    if (this._testType === 'one') {
      const tv = parseFloat(this._targetValue);
      if (this._category === 'variance') {
        if (isNaN(tv) || tv <= 0) { this._hideResults(); return; }
        target = this._targetType === 'stddev' ? tv * tv : tv;
      } else {
        if (isNaN(tv)) { this._hideResults(); return; }
        target = tv;
      }
    }

    // Step 1: Normality
    const alpha = this._alpha;
    const sw1 = shapiroWilk(d1);
    const ad1 = andersonDarling(d1);
    const n1Normal = sw1.pValue >= alpha && ad1.pValue >= alpha;

    let sw2 = null, ad2 = null, n2Normal = true;
    if (d2) {
      sw2 = shapiroWilk(d2);
      ad2 = andersonDarling(d2);
      n2Normal = sw2.pValue >= alpha && ad2.pValue >= alpha;
    }
    const allNormal = n1Normal && n2Normal;

    this._normality = { sw1, ad1, n1Normal, sw2, ad2, n2Normal, allNormal };

    // Determine algorithm route
    let algo;
    if (this._category === 'variance') {
      if (this._testType === 'one') {
        algo = n1Normal
          ? { id: 'chi2', name: 'Chi-Square Variance Test', reason: 'normalRouteChiSq' }
          : { id: 'chi2', name: 'Chi-Square Variance Test', reason: 'nonNormalWarnChiSq' };
      } else {
        algo = allNormal
          ? { id: 'ftest', name: 'F-Test', reason: 'normalRouteFTest' }
          : { id: 'levene', name: 'Levene Test (Brown-Forsythe)', reason: 'nonNormalRouteLevene' };
      }
    } else {
      if (this._testType === 'one') {
        algo = n1Normal
          ? { id: 'ttest1', name: 'One-Sample t-Test', reason: 'normalRouteTTest1' }
          : { id: 'wilcoxon', name: 'Wilcoxon Signed-Rank Test', reason: 'nonNormalRouteWilcoxon' };
      } else {
        // Need variance check first
        algo = { id: 'pending', name: '', reason: 'pendingVarCheck' };
      }
    }

    // For two-sample mean: variance equality check
    if (this._category === 'mean' && this._testType === 'two') {
      let veResult;
      if (allNormal) {
        veResult = fTest(d1, d2, 'two-sided', alpha);
      } else {
        veResult = leveneTest(d1, d2, alpha);
      }
      this._varEquality = { result: veResult, varsEqual: !veResult.reject };

      if (allNormal && !veResult.reject) {
        algo = { id: 'ttest2p', name: 'Two-Sample t-Test (pooled)', reason: 'normalEqualVarRoute' };
      } else if (allNormal && veResult.reject) {
        algo = { id: 'welch', name: 'Welch t-Test', reason: 'normalUnequalVarRoute' };
      } else {
        algo = { id: 'mannwhitney', name: 'Mann-Whitney U Test', reason: 'nonNormalRouteMannWhitney' };
      }
    }

    this._algoRoute = algo;

    // Run main test
    let result;
    const dir = this._direction;
    if (algo.id === 'chi2') result = chiSquareVarianceTest(d1, target, dir, alpha);
    else if (algo.id === 'ftest') result = fTest(d1, d2, dir, alpha);
    else if (algo.id === 'levene') result = leveneTest(d1, d2, alpha);
    else if (algo.id === 'ttest1') result = oneSampleTTest(d1, target, dir, alpha);
    else if (algo.id === 'wilcoxon') result = wilcoxonSignedRank(d1, target, dir, alpha);
    else if (algo.id === 'ttest2p') result = twoSampleTTest(d1, d2, dir, alpha);
    else if (algo.id === 'welch') result = welchTTest(d1, d2, dir, alpha);
    else if (algo.id === 'mannwhitney') result = mannWhitneyU(d1, d2, dir, alpha);

    this._result = result;

    // Render all results
    this._renderAllResults(d1, d2, target);
  },

  // ─── Render Results ─────────────────────────────────────────

  _renderAllResults(d1, d2, target) {
    const t = (k, v) => this._t(k, v);
    const resEl = this._container.querySelector('[data-ref="results"]');
    const phEl = this._container.querySelector('[data-ref="placeholder"]');
    phEl.style.display = 'none';
    resEl.style.display = 'block';

    const alpha = this._alpha;
    const norm = this._normality;
    const r = this._result;
    const algo = this._algoRoute;

    let html = '';

    // ── Section 1: Normality ──
    html += `<div class="dmike-split__output-section">${t('sectionNormality')}</div>`;
    html += this._renderNormCard('S1', d1, norm.sw1, norm.ad1, norm.n1Normal, alpha);
    if (d2) html += this._renderNormCard('S2', d2, norm.sw2, norm.ad2, norm.n2Normal, alpha);

    // Routing
    html += `<div class="hyptest__route-card">
      <div class="hyptest__route-title">${t('algoRouting')}</div>
      <div class="hyptest__route-trail">
        <span class="hyptest__trail-dot ${norm.allNormal ? 'hyptest__trail-dot--pass' : 'hyptest__trail-dot--fail'}"></span>
        <span>${t('normalLabel')}: <strong>${norm.allNormal ? t('yes') : t('no')}</strong></span>
        ${this._varEquality ? `
          <span class="hyptest__trail-line"></span>
          <span class="hyptest__trail-dot ${this._varEquality.varsEqual ? 'hyptest__trail-dot--pass' : 'hyptest__trail-dot--fail'}"></span>
          <span>${t('varEqualLabel')}: <strong>${this._varEquality.varsEqual ? t('yes') : t('no')}</strong></span>
        ` : ''}
        <span class="hyptest__trail-line"></span>
        <span class="hyptest__trail-dot hyptest__trail-dot--info"></span>
        <span>&rarr; <strong>${algoLink(algo.name, this._context.eventBus)}</strong></span>
      </div>
    </div>`;

    // ── Section 2: Variance Equality (if applicable) ──
    if (this._varEquality) {
      const ve = this._varEquality.result;
      html += `<div class="dmike-split__output-section">${t('sectionVarEquality')}</div>`;
      html += `<div class="hyptest__result-card">
        <div class="hyptest__metrics">
          <div class="hyptest__metric"><div class="hyptest__metric-label">${t('testMethod')}</div><div class="hyptest__metric-value hyptest__metric-value--sm">${algoLink(ve.testName, this._context.eventBus)}</div></div>
          <div class="hyptest__metric"><div class="hyptest__metric-label">${t('statistic')}</div><div class="hyptest__metric-value">${fmt(ve.statistic)}</div></div>
          <div class="hyptest__metric"><div class="hyptest__metric-label">p</div><div class="hyptest__metric-value ${ve.pValue < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success'}">${fmt(ve.pValue)}</div></div>
          <div class="hyptest__metric"><div class="hyptest__metric-label">s\u00B2\u2081</div><div class="hyptest__metric-value">${fmt(ve.variance1)}</div></div>
          <div class="hyptest__metric"><div class="hyptest__metric-label">s\u00B2\u2082</div><div class="hyptest__metric-value">${fmt(ve.variance2)}</div></div>
        </div>
        <div class="hyptest__decision ${this._varEquality.varsEqual ? 'hyptest__decision--accept' : 'hyptest__decision--reject'}">
          <strong>${this._varEquality.varsEqual ? t('varEqual') : t('varUnequal')}</strong>
        </div>
      </div>`;
    }

    // ── Section 3: Main Test Result ──
    html += `<div class="dmike-split__output-section">${t('sectionResult')}</div>`;
    html += this._renderMainResult(r, algo, alpha, d1, d2, target);

    // ── Section 4: Power Analysis ──
    html += `<div class="dmike-split__output-section">${t('sectionPower')}</div>`;
    html += this._renderPower(d1, d2, target, alpha);

    resEl.innerHTML = html;

    // Bind algo links
    resEl.querySelectorAll('.hyptest__algo-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this._context.eventBus.emit('lab:navigate', { algoId: btn.dataset.algoId, tab: 'docs' });
      });
    });

    // Add tooltips to metric tiles
    this._addMetricTooltips(resEl);
  },

  _renderNormCard(label, data, sw, ad, isNormal, alpha) {
    const t = (k, v) => this._t(k, v);
    const badge = isNormal ? 'hyptest__badge--pass' : 'hyptest__badge--fail';
    const badgeText = isNormal ? t('normal') : t('notNormal');

    const _normDS = descriptiveStats(data);
    const mean = _normDS.mean;
    const sd = _normDS.stdDev;
    const variance = _normDS.variance;
    const n = data.length;

    // Confidence intervals at 1 \u2212 \u03B1 level
    const ciMean = this._ciMean(mean, sd, n, alpha);
    const ciVar = this._ciVariance(variance, n, alpha);
    const ciSd = ciVar ? [Math.sqrt(ciVar[0]), Math.sqrt(ciVar[1])] : null;
    const ciFmt = (ci) => ci ? `[${fmt(ci[0])}, ${fmt(ci[1])}]` : '';

    return `<div class="hyptest__result-card">
      <div class="hyptest__card-header">${esc(label)} <span class="hyptest__badge ${badge}">${badgeText}</span></div>
      <table>
        <thead><tr><th>Test</th><th>${t('statistic')}</th><th>p</th><th>${t('decision')}</th></tr></thead>
        <tbody>
          <tr>
            <td>${algoLink('Shapiro-Wilk', this._context.eventBus)}</td>
            <td>${fmt(sw.statistic)}</td>
            <td class="${sw.pValue < alpha ? 'hyptest__text-danger' : 'hyptest__text-success'}">${fmt(sw.pValue)}</td>
            <td>${sw.pValue < alpha ? '\u2717 ' + t('reject') : '\u2713 ' + t('notReject')}</td>
          </tr>
          <tr>
            <td>${algoLink('Anderson-Darling', this._context.eventBus)}</td>
            <td>${fmt(ad.statistic)}</td>
            <td class="${ad.pValue < alpha ? 'hyptest__text-danger' : 'hyptest__text-success'}">${fmt(ad.pValue)}</td>
            <td>${ad.pValue < alpha ? '\u2717 ' + t('reject') : '\u2713 ' + t('notReject')}</td>
          </tr>
        </tbody>
      </table>
      <div class="hyptest__metrics hyptest__metrics--sm">
        <div class="hyptest__metric"><div class="hyptest__metric-label">n</div><div class="hyptest__metric-value">${n}</div></div>
        <div class="hyptest__metric"><div class="hyptest__metric-label">x\u0304</div><div class="hyptest__metric-value">${fmt(mean)}</div>${ciMean ? `<div class="hyptest__metric-ci">${ciFmt(ciMean)}</div>` : ''}</div>
        <div class="hyptest__metric"><div class="hyptest__metric-label">s</div><div class="hyptest__metric-value">${fmt(sd)}</div>${ciSd ? `<div class="hyptest__metric-ci">${ciFmt(ciSd)}</div>` : ''}</div>
        <div class="hyptest__metric"><div class="hyptest__metric-label">s\u00B2</div><div class="hyptest__metric-value">${fmt(variance)}</div>${ciVar ? `<div class="hyptest__metric-ci">${ciFmt(ciVar)}</div>` : ''}</div>
      </div>
    </div>`;
  },

  /** (1 \u2212 \u03B1) CI for the mean using t-distribution. */
  _ciMean(mean, sd, n, alpha) {
    if (n < 2 || !isFinite(sd) || sd <= 0) return null;
    const tCrit = tInv(1 - alpha / 2, n - 1);
    const se = sd / Math.sqrt(n);
    return [mean - tCrit * se, mean + tCrit * se];
  },

  /** (1 \u2212 \u03B1) CI for the variance using \u03C7\u00B2 distribution. */
  _ciVariance(variance, n, alpha) {
    if (n < 2 || !isFinite(variance) || variance <= 0) return null;
    const lo = (n - 1) * variance / chi2Inv(1 - alpha / 2, n - 1);
    const hi = (n - 1) * variance / chi2Inv(alpha / 2, n - 1);
    return [lo, hi];
  },

  /** Lookup table: metric label \u2192 tooltip text, applied via post-render pass. */
  _metricTooltips() {
    const t = (k) => this._t(k);
    const map = {
      [t('testMethod')]: t('tipTestMethod'),
      [t('statistic')]: t('tipStatistic'),
      [t('currentPower')]: t('tipCurrentPower'),
      [t('powerGoal')]: t('tipPowerGoal'),
      [t('requiredN')]: t('tipRequiredN'),
      [t('varianceRatio')]: t('tipVarianceRatio'),
      'p': t('tipPValue'),
      'df': t('tipDf'),
      'n': t('tipN'),
      'N': t('tipBigN'),
      'k': t('tipK'),
      'x\u0304': t('tipMean'),
      'x\u0304\u2081': t('tipMean1'),
      'x\u0304\u2082': t('tipMean2'),
      's': t('tipStdDev'),
      's\u00B2': t('tipVariance'),
      's\u00B2\u2081': t('tipVariance1'),
      's\u00B2\u2082': t('tipVariance2'),
      's\u00B2\u209A': t('tipPooledVar'),
      '\u03B1': t('tipAlpha'),
      "Cohen's d": t('tipCohensD'),
    };
    // CI label is dynamic ("95% KI" / "95% CI") \u2192 match by suffix
    return map;
  },

  /** Walk all .hyptest__metric tiles and add a title attribute when a tooltip is known. */
  _addMetricTooltips(root) {
    const tips = this._metricTooltips();
    const ciSuffix = this._t('tipConfidenceInterval');
    root.querySelectorAll('.hyptest__metric').forEach(m => {
      const labelEl = m.querySelector('.hyptest__metric-label');
      if (!labelEl) return;
      const label = labelEl.textContent.trim();
      if (label.endsWith('KI') || label.endsWith('CI')) {
        m.title = ciSuffix;
        return;
      }
      if (tips[label]) m.title = tips[label];
    });
  },

  _renderMainResult(r, algo, alpha, d1, d2, target) {
    const t = (k, v) => this._t(k, v);
    const dir = this._direction;
    const sym0 = dir === 'two-sided' ? '=' : dir === 'greater' ? '\u2264' : '\u2265';
    const sym1 = dir === 'two-sided' ? '\u2260' : dir === 'greater' ? '>' : '<';

    let h0, h1;
    if (this._category === 'variance') {
      if (this._testType === 'one') { h0 = `\u03C3\u00B2 ${sym0} ${fmt(target)}`; h1 = `\u03C3\u00B2 ${sym1} ${fmt(target)}`; }
      else { h0 = `\u03C3\u00B2\u2081 ${sym0} \u03C3\u00B2\u2082`; h1 = `\u03C3\u00B2\u2081 ${sym1} \u03C3\u00B2\u2082`; }
    } else {
      if (this._testType === 'one') { h0 = `\u03BC ${sym0} ${fmt(target)}`; h1 = `\u03BC ${sym1} ${fmt(target)}`; }
      else { h0 = `\u03BC\u2081 ${sym0} \u03BC\u2082`; h1 = `\u03BC\u2081 ${sym1} \u03BC\u2082`; }
    }

    let metricsHTML = `
      <div class="hyptest__metric"><div class="hyptest__metric-label">${t('testMethod')}</div><div class="hyptest__metric-value hyptest__metric-value--sm">${algoLink(r.testName, this._context.eventBus)}</div></div>
      <div class="hyptest__metric"><div class="hyptest__metric-label">${t('statistic')}</div><div class="hyptest__metric-value">${fmt(r.statistic)}</div></div>
      <div class="hyptest__metric"><div class="hyptest__metric-label">p</div><div class="hyptest__metric-value ${r.pValue < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success'}">${fmt(r.pValue)}</div></div>`;

    if (r.df != null) metricsHTML += `<div class="hyptest__metric"><div class="hyptest__metric-label">df</div><div class="hyptest__metric-value">${typeof r.df === 'number' && r.df % 1 ? fmt(r.df, 1) : r.df}</div></div>`;
    if (r.ci) metricsHTML += `<div class="hyptest__metric"><div class="hyptest__metric-label">${Math.round((1 - alpha) * 100)}% KI</div><div class="hyptest__metric-value hyptest__metric-value--sm">[${fmt(r.ci[0])}, ${fmt(r.ci[1])}]</div></div>`;
    if (r.mean != null) metricsHTML += `<div class="hyptest__metric"><div class="hyptest__metric-label">x\u0304</div><div class="hyptest__metric-value">${fmt(r.mean)}</div></div>`;
    if (r.mean1 != null) metricsHTML += `<div class="hyptest__metric"><div class="hyptest__metric-label">x\u0304\u2081</div><div class="hyptest__metric-value">${fmt(r.mean1)}</div></div><div class="hyptest__metric"><div class="hyptest__metric-label">x\u0304\u2082</div><div class="hyptest__metric-value">${fmt(r.mean2)}</div></div>`;
    if (r.sampleVariance != null) metricsHTML += `<div class="hyptest__metric"><div class="hyptest__metric-label">s\u00B2</div><div class="hyptest__metric-value">${fmt(r.sampleVariance)}</div></div>`;
    if (r.variance1 != null && !r.pooledVariance) metricsHTML += `<div class="hyptest__metric"><div class="hyptest__metric-label">s\u00B2\u2081</div><div class="hyptest__metric-value">${fmt(r.variance1)}</div></div><div class="hyptest__metric"><div class="hyptest__metric-label">s\u00B2\u2082</div><div class="hyptest__metric-value">${fmt(r.variance2)}</div></div>`;

    const h0Class = r.reject ? 'hyptest__h-box--rejected' : 'hyptest__h-box--accepted';
    const h1Class = r.reject ? 'hyptest__h-box--accepted' : 'hyptest__h-box--rejected';
    const h0Tip = r.reject
      ? `${t('h0Rejected')}: p (${fmt(r.pValue)}) < \u03B1 (${alpha})`
      : `${t('h0NotRejected')}: p (${fmt(r.pValue)}) \u2265 \u03B1 (${alpha})`;
    const h1Tip = r.reject
      ? `${t('significant')}: ${t('h0Rejected')}`
      : `${t('notSignificant')}: ${t('h0NotRejected')}`;

    return `<div class="hyptest__result-card">
      <div class="hyptest__hypothesis-preview hyptest__hypothesis-preview--sm field-row">
        <div class="hyptest__h-box ${h0Class}" title="${esc(h0Tip)}"><span class="hyptest__h-label">H\u2080</span><span class="hyptest__h-formula">${h0}</span></div>
        <div class="hyptest__h-box ${h1Class}" title="${esc(h1Tip)}"><span class="hyptest__h-label">H\u2081</span><span class="hyptest__h-formula">${h1}</span></div>
      </div>
      <div class="hyptest__metrics">${metricsHTML}</div>
    </div>`;
  },

  _renderPower(d1, d2, target, alpha) {
    const t = (k, v) => this._t(k, v);
    const dir = this._direction;
    const n1 = d1.length;

    let curPow, curEff, effLabel, nForGoal;
    const goal = this._powerGoal;

    const _ds = (a) => descriptiveStats(a);
    const mean = (a) => _ds(a).mean;
    const vari = (a) => _ds(a).variance;
    const sd = (a) => _ds(a).stdDev;

    if (this._category === 'variance') {
      if (this._testType === 'one') {
        const s2 = vari(d1);
        curEff = s2 / target;
        curPow = powerChiSquare(n1, target, s2, alpha, dir);
        effLabel = t('varianceRatio');
        nForGoal = findRequiredN(goal, n => powerChiSquare(n, target, s2, alpha, dir));
      } else {
        const s1 = vari(d1), s2 = vari(d2);
        curEff = s1 / s2;
        curPow = powerFTest(n1, d2.length, curEff, alpha, dir);
        effLabel = t('varianceRatio');
        nForGoal = findRequiredN(goal, n => powerFTest(n, n, curEff, alpha, dir));
      }
    } else {
      const sigma = sd(d1);
      if (this._testType === 'one') {
        const delta = Math.abs(mean(d1) - target);
        curEff = sigma > 0 ? delta / sigma : 0;
        curPow = powerOneSampleT(n1, delta, sigma, alpha, dir);
        effLabel = "Cohen's d";
        nForGoal = findRequiredN(goal, n => powerOneSampleT(n, delta, sigma, alpha, dir));
      } else {
        const delta = Math.abs(mean(d1) - mean(d2));
        const sp = Math.sqrt(((d1.length - 1) * vari(d1) + (d2.length - 1) * vari(d2)) / (d1.length + d2.length - 2));
        curEff = sp > 0 ? delta / sp : 0;
        curPow = powerTwoSampleT(n1, d2.length, delta, sp, alpha, dir);
        effLabel = "Cohen's d";
        nForGoal = findRequiredN(goal, n => powerTwoSampleT(n, n, delta, sp, alpha, dir));
      }
    }

    const goalPct = (goal * 100).toFixed(0);
    const goalReached = curPow >= goal;
    const powClass = goalReached ? 'hyptest__metric-value--success' : 'hyptest__metric-value--warning';
    const goalBoxClass = goalReached ? 'hyptest__decision--accept' : 'hyptest__decision--warn';

    return `<div class="hyptest__result-card">
      <div class="hyptest__decision ${goalBoxClass}">
        <strong>${t('powerGoal')}: ${goalPct}%</strong>
        <p>${t('requiredN')}${d2 ? ' (' + t('perGroup') + ')' : ''}: ${nForGoal >= 5000 ? '> 5000' : nForGoal}
         — ${goalReached ? '\u2713 ' + t('achieved') : '\u2717 ' + t('notAchieved')}</p>
      </div>
      <div class="hyptest__metrics">
        <div class="hyptest__metric"><div class="hyptest__metric-label">${t('currentPower')}</div><div class="hyptest__metric-value ${powClass}">${(curPow * 100).toFixed(1)}%</div></div>
        <div class="hyptest__metric"><div class="hyptest__metric-label">n</div><div class="hyptest__metric-value">${n1}${d2 ? ' / ' + d2.length : ''}</div></div>
        <div class="hyptest__metric"><div class="hyptest__metric-label">${effLabel}</div><div class="hyptest__metric-value">${fmt(curEff, 3)}</div></div>
        <div class="hyptest__metric"><div class="hyptest__metric-label">\u03B1</div><div class="hyptest__metric-value">${alpha}</div></div>
      </div>
    </div>`;
  },

  // ─── k-Sample Analysis ──────────────────────────────────────

  _runAnalysisK() {
    const refs = this._pickerK?.value || [];
    const groups = this._getDataK();

    if (groups.length < 2 || groups.some(g => g.length < 3)) {
      this._hideResults();
      return;
    }

    const alpha = this._alpha;
    const isVariance = this._category === 'variance';

    // Normality on each group
    const sws = groups.map(g => shapiroWilk(g));
    const ads = groups.map(g => andersonDarling(g));
    const groupNormal = groups.map((_, i) => sws[i].pValue >= alpha && ads[i].pValue >= alpha);
    const allNormal = groupNormal.every(Boolean);

    let algo, result, ve = null;

    if (isVariance) {
      // k-sample variance test: Bartlett (normal) or Levene-k (robust)
      if (allNormal) {
        algo = { id: 'bartlett', name: "Bartlett's Test", reason: 'kSampleNormalRouteBartlett' };
        result = bartlettTest(groups, alpha);
      } else {
        algo = { id: 'leveneK', name: 'Levene Test (Brown-Forsythe)', reason: 'kSampleNonNormalRouteLevene' };
        result = leveneTestK(groups, alpha);
      }
    } else {
      // k-sample mean: ANOVA (normal) or Kruskal-Wallis (non-normal)
      // Levene-k is run informationally to flag the equal-variance assumption
      const lev = leveneTestK(groups, alpha);
      ve = { result: lev, varsEqual: !lev.reject };

      if (allNormal) {
        algo = { id: 'anova', name: 'One-Way ANOVA', reason: 'kSampleNormalRouteANOVA' };
        result = oneWayANOVA(groups, alpha);
      } else {
        algo = { id: 'kruskalwallis', name: 'Kruskal-Wallis Test', reason: 'kSampleNonNormalRouteKW' };
        result = kruskalWallis(groups, alpha);
      }
    }

    this._normality = { sws, ads, groupNormal, allNormal };
    this._varEquality = ve;
    this._algoRoute = algo;
    this._result = result;

    // Post-hoc pairwise comparisons + compact letter display (only meaningful for k ≥ 3)
    this._pairwise = groups.length >= 3
      ? this._computePairwise(groups, alpha, isVariance, allNormal)
      : null;

    this._renderAllResultsK(refs, groups);
  },

  // ─── Pairwise post-hoc ──────────────────────────────────────

  /**
   * Run pairwise tests using the same family as the global test, with
   * Bonferroni correction (p_adj = min(1, p × m), m = k(k−1)/2).
   * Returns { comparisons: [{i,j,p,pAdj,equal}], letters: string[], m, methodName }
   */
  _computePairwise(groups, alpha, isVariance, isNormal) {
    const k = groups.length;
    const m = k * (k - 1) / 2;
    const useWelch = !isVariance && isNormal && this._varEquality && !this._varEquality.varsEqual;

    const methodName = isVariance
      ? (isNormal ? 'F-Test' : 'Levene Test (Brown-Forsythe)')
      : (isNormal ? (useWelch ? 'Welch t-Test' : 'Two-Sample t-Test (pooled)') : 'Mann-Whitney U Test');

    const comparisons = [];
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        let r;
        if (isVariance) {
          r = isNormal
            ? fTest(groups[i], groups[j], 'two-sided', alpha)
            : leveneTest(groups[i], groups[j], alpha);
        } else if (isNormal) {
          r = useWelch
            ? welchTTest(groups[i], groups[j], 'two-sided', alpha)
            : twoSampleTTest(groups[i], groups[j], 'two-sided', alpha);
        } else {
          r = mannWhitneyU(groups[i], groups[j], 'two-sided', alpha);
        }
        const p = r.pValue;
        const pAdj = Math.min(1, p * m);
        comparisons.push({ i, j, p, pAdj, equal: pAdj >= alpha });
      }
    }

    const letters = this._compactLetterDisplay(k, comparisons);
    return { comparisons, letters, m, methodName };
  },

  /**
   * Compact letter display: groups sharing a letter are not significantly
   * different. Implementation: enumerate maximal cliques in the
   * "not-significantly-different" graph via Bron-Kerbosch; each clique → one
   * letter; each group inherits letters of every clique it belongs to.
   */
  _compactLetterDisplay(k, comparisons) {
    // Build adjacency of "compatible" groups (no significant difference)
    const adj = Array.from({ length: k }, () => new Set());
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j) adj[i].add(j);
    for (const c of comparisons) {
      if (!c.equal) { adj[c.i].delete(c.j); adj[c.j].delete(c.i); }
    }

    // Bron-Kerbosch (no pivoting; k is small)
    const cliques = [];
    const bk = (R, P, X) => {
      if (P.size === 0 && X.size === 0) { cliques.push([...R].sort((a, b) => a - b)); return; }
      for (const v of [...P]) {
        const N = adj[v];
        bk(
          new Set([...R, v]),
          new Set([...P].filter(x => N.has(x))),
          new Set([...X].filter(x => N.has(x))),
        );
        P.delete(v);
        X.add(v);
      }
    };
    bk(new Set(), new Set(Array.from({ length: k }, (_, i) => i)), new Set());

    // Dedupe (BK without pivoting can repeat) and sort for stable letter order
    const seen = new Set();
    const unique = [];
    for (const c of cliques) {
      const key = c.join(',');
      if (!seen.has(key)) { seen.add(key); unique.push(c); }
    }
    unique.sort((a, b) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
      return a.length - b.length;
    });

    const letters = Array.from({ length: k }, () => '');
    for (let c = 0; c < unique.length; c++) {
      const letter = String.fromCharCode(97 + c);
      for (const v of unique[c]) letters[v] += letter;
    }
    // Singleton fallback: a group disjoint from all others should still get a letter
    for (let i = 0; i < k; i++) {
      if (letters[i] === '') letters[i] = String.fromCharCode(97 + unique.length + i);
    }
    return letters;
  },

  _renderAllResultsK(refs, groups) {
    const t = (k, v) => this._t(k, v);
    const resEl = this._container.querySelector('[data-ref="results"]');
    const phEl = this._container.querySelector('[data-ref="placeholder"]');
    phEl.style.display = 'none';
    resEl.style.display = 'block';

    const alpha = this._alpha;
    const norm = this._normality;
    const ve = this._varEquality;
    const algo = this._algoRoute;
    const r = this._result;

    let html = '';

    // Section 1: Normality (per group) — grid so cards sit side-by-side
    html += `<div class="dmike-split__output-section">${t('sectionNormality')}</div>`;
    html += `<div class="hyptest__norm-grid">`;
    for (let i = 0; i < groups.length; i++) {
      const label = this._refName(refs[i]);
      html += this._renderNormCard(label, groups[i], norm.sws[i], norm.ads[i], norm.groupNormal[i], alpha);
    }
    html += `</div>`;

    // Routing
    html += `<div class="hyptest__route-card">
      <div class="hyptest__route-title">${t('algoRouting')}</div>
      <div class="hyptest__route-trail">
        <span class="hyptest__trail-dot ${norm.allNormal ? 'hyptest__trail-dot--pass' : 'hyptest__trail-dot--fail'}"></span>
        <span>${t('normalLabel')}: <strong>${norm.allNormal ? t('yes') : t('no')}</strong></span>
        ${ve ? `
          <span class="hyptest__trail-line"></span>
          <span class="hyptest__trail-dot ${ve.varsEqual ? 'hyptest__trail-dot--pass' : 'hyptest__trail-dot--fail'}"></span>
          <span>${t('varEqualLabel')}: <strong>${ve.varsEqual ? t('yes') : t('no')}</strong></span>
        ` : ''}
        <span class="hyptest__trail-line"></span>
        <span class="hyptest__trail-dot hyptest__trail-dot--info"></span>
        <span>&rarr; <strong>${algoLink(algo.name, this._context.eventBus)}</strong></span>
      </div>
    </div>`;

    // Section 2: Variance Equality (only for mean category — informational)
    if (ve) {
      const veRes = ve.result;
      html += `<div class="dmike-split__output-section">${t('sectionVarEquality')}</div>`;
      html += `<div class="hyptest__result-card">
        <div class="hyptest__metrics">
          <div class="hyptest__metric"><div class="hyptest__metric-label">${t('testMethod')}</div><div class="hyptest__metric-value hyptest__metric-value--sm">${algoLink(veRes.testName, this._context.eventBus)}</div></div>
          <div class="hyptest__metric"><div class="hyptest__metric-label">${t('statistic')}</div><div class="hyptest__metric-value">${fmt(veRes.statistic)}</div></div>
          <div class="hyptest__metric"><div class="hyptest__metric-label">df</div><div class="hyptest__metric-value">${veRes.df1} / ${veRes.df2}</div></div>
          <div class="hyptest__metric"><div class="hyptest__metric-label">p</div><div class="hyptest__metric-value ${veRes.pValue < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success'}">${fmt(veRes.pValue)}</div></div>
        </div>
        <div class="hyptest__decision ${ve.varsEqual ? 'hyptest__decision--accept' : 'hyptest__decision--reject'}">
          <strong>${ve.varsEqual ? t('varEqual') : t('varUnequal')}</strong>
        </div>
      </div>`;
    }

    // Section 3: Main Test Result
    html += `<div class="dmike-split__output-section">${t('sectionResult')}</div>`;
    html += this._renderKResult(r, refs, groups, alpha);

    // Section 4: Pairwise post-hoc (only when k ≥ 3)
    if (this._pairwise) {
      html += `<div class="dmike-split__output-section">${t('sectionPairwise')}</div>`;
      html += this._renderPairwiseSection(refs, groups, alpha);
    }

    resEl.innerHTML = html;

    // Bind algo links
    resEl.querySelectorAll('.hyptest__algo-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this._context.eventBus.emit('lab:navigate', { algoId: btn.dataset.algoId, tab: 'docs' });
      });
    });

    // Add tooltips to metric tiles
    this._addMetricTooltips(resEl);
  },

  _renderKResult(r, refs, groups, alpha) {
    const t = (k, v) => this._t(k, v);
    const isAnova = r.testName === 'One-Way ANOVA';
    const isVariance = this._category === 'variance';
    // Bartlett & Levene-k both have df1/df2 (Levene) or df (Bartlett)
    const has2Df = r.df1 != null && r.df2 != null;

    let h0, h1;
    if (isVariance) {
      h0 = `σ²₁ = σ²₂ = … = σ²ₖ`;
      h1 = t('kSampleVarH1');
    } else {
      h0 = `μ₁ = μ₂ = … = μₖ`;
      h1 = t('kSampleH1');
    }

    const h0Class = r.reject ? 'hyptest__h-box--rejected' : 'hyptest__h-box--accepted';
    const h1Class = r.reject ? 'hyptest__h-box--accepted' : 'hyptest__h-box--rejected';

    const dfDisplay = has2Df ? `${r.df1} / ${r.df2}` : r.df;

    let metricsHTML = `
      <div class="hyptest__metric"><div class="hyptest__metric-label">${t('testMethod')}</div><div class="hyptest__metric-value hyptest__metric-value--sm">${algoLink(r.testName, this._context.eventBus)}</div></div>
      <div class="hyptest__metric"><div class="hyptest__metric-label">${t('statistic')}</div><div class="hyptest__metric-value">${fmt(r.statistic)}</div></div>
      <div class="hyptest__metric"><div class="hyptest__metric-label">df</div><div class="hyptest__metric-value">${dfDisplay}</div></div>
      <div class="hyptest__metric"><div class="hyptest__metric-label">p</div><div class="hyptest__metric-value ${r.pValue < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success'}">${fmt(r.pValue)}</div></div>
      <div class="hyptest__metric"><div class="hyptest__metric-label">k</div><div class="hyptest__metric-value">${r.k}</div></div>
      ${r.N != null ? `<div class="hyptest__metric"><div class="hyptest__metric-label">N</div><div class="hyptest__metric-value">${r.N}</div></div>` : ''}
      ${r.pooledVariance != null ? `<div class="hyptest__metric"><div class="hyptest__metric-label">s²ₚ</div><div class="hyptest__metric-value">${fmt(r.pooledVariance)}</div></div>` : ''}
    `;

    // ANOVA table
    let anovaTable = '';
    if (isAnova) {
      anovaTable = `
        <table>
          <thead><tr><th>${t('source')}</th><th>SS</th><th>df</th><th>MS</th><th>F</th><th>p</th></tr></thead>
          <tbody>
            <tr><td>${t('between')}</td><td>${fmt(r.SSB)}</td><td>${r.df1}</td><td>${fmt(r.MSB)}</td><td>${fmt(r.statistic)}</td><td class="${r.pValue < alpha ? 'hyptest__text-danger' : 'hyptest__text-success'}">${fmt(r.pValue)}</td></tr>
            <tr><td>${t('within')}</td><td>${fmt(r.SSW)}</td><td>${r.df2}</td><td>${fmt(r.MSW)}</td><td>—</td><td>—</td></tr>
            <tr><td><strong>${t('total')}</strong></td><td><strong>${fmt(r.SST)}</strong></td><td><strong>${r.df1 + r.df2}</strong></td><td>—</td><td>—</td><td>—</td></tr>
          </tbody>
        </table>
      `;
    }

    // Group summary table — adds compact-letter-display column when k ≥ 3
    const letters = this._pairwise?.letters || [];
    const showCld = letters.length > 0;
    let groupTable = `
      <table>
        <thead><tr><th>${t('group')}</th><th>n</th><th>x̄</th><th>s²</th>${showCld ? `<th title="${esc(t('groupingHint'))}">${t('groupingLabel')}</th>` : ''}</tr></thead>
        <tbody>
          ${groups.map((g, i) => {
            const ds = descriptiveStats(g);
            return `<tr><td>${esc(this._refName(refs[i]))}</td><td>${g.length}</td><td>${fmt(ds.mean)}</td><td>${fmt(ds.variance)}</td>${showCld ? `<td><strong class="hyptest__cld-letters">${esc(letters[i])}</strong></td>` : ''}</tr>`;
          }).join('')}
        </tbody>
      </table>
    `;

    return `<div class="hyptest__result-card">
      <div class="hyptest__hypothesis-preview hyptest__hypothesis-preview--sm field-row">
        <div class="hyptest__h-box ${h0Class}"><span class="hyptest__h-label">H₀</span><span class="hyptest__h-formula">${h0}</span></div>
        <div class="hyptest__h-box ${h1Class}"><span class="hyptest__h-label">H₁</span><span class="hyptest__h-formula">${h1}</span></div>
      </div>
      <div class="hyptest__metrics">${metricsHTML}</div>
      ${anovaTable}
      ${groupTable}
    </div>`;
  },

  /**
   * Render the pairwise comparison section: meta line, k×k upper-triangle
   * matrix of Bonferroni-corrected p-values colored by equality, plus a
   * legend pointing back to the CLD column in the group summary table.
   */
  _renderPairwiseSection(refs, groups, alpha) {
    const t = (k, v) => this._t(k, v);
    const { comparisons, m, methodName, letters } = this._pairwise;
    const k = groups.length;

    const find = (i, j) => comparisons.find(c =>
      (c.i === i && c.j === j) || (c.i === j && c.j === i));

    let matrix = `<table class="hyptest__pairwise"><thead><tr><th></th>`;
    for (let j = 0; j < k; j++) matrix += `<th>${esc(this._refName(refs[j]))}</th>`;
    matrix += `</tr></thead><tbody>`;
    for (let i = 0; i < k; i++) {
      matrix += `<tr><th>${esc(this._refName(refs[i]))}</th>`;
      for (let j = 0; j < k; j++) {
        if (j <= i) {
          matrix += `<td class="hyptest__pairwise-empty">—</td>`;
        } else {
          const c = find(i, j);
          const cls = c.equal ? 'hyptest__pairwise-equal' : 'hyptest__pairwise-diff';
          const tip = `p=${fmt(c.p)}  ·  p_adj=${fmt(c.pAdj)}  ·  ${c.equal ? t('pairwiseEqual') : t('pairwiseDifferent')}`;
          matrix += `<td class="${cls}" title="${esc(tip)}">${fmt(c.pAdj)}</td>`;
        }
      }
      matrix += `</tr>`;
    }
    matrix += `</tbody></table>`;

    return `<div class="hyptest__result-card">
      <div class="hyptest__pairwise-meta">
        ${t('pairwiseMethod')}: <strong>${algoLink(methodName, this._context.eventBus)}</strong>
        · ${t('pairwiseHint', { m })}
      </div>
      ${matrix}
      <div class="hyptest__pairwise-legend">
        <span class="hyptest__pairwise-swatch hyptest__pairwise-equal"></span> ${t('pairwiseEqual')} (p_adj ≥ ${alpha})
        <span class="hyptest__pairwise-swatch hyptest__pairwise-diff"></span> ${t('pairwiseDifferent')} (p_adj &lt; ${alpha})
      </div>
      <div class="hyptest__cld-hint">${t('groupingHint')} (${t('groupingLabel')}: <strong>${letters.map(l => esc(l)).join(', ')}</strong>)</div>
    </div>`;
  },

  // ─── Actions ────────────────────────────────────────────────

};
