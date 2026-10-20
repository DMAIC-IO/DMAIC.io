/**
 * D.Mike — Hypothesis Test Module (hypothesis-test.js)
 * Analyze phase: guided hypothesis testing for variance and mean
 * with automatic normality assessment and algorithm routing.
 *
 * Migrated to createModule + Alpine CSP. The Model (hypothesis-test-model.js)
 * holds only the persistent configuration; the full analysis result is derived
 * transiently in the view from those inputs plus the live worksheet columns,
 * and exposed to the template as a single plain `result` object (no HTML built
 * in JS). All statistics stay in the engines (hypothesis-test-engine,
 * normality-test-engine, math-utils) — nothing is reimplemented here.
 *
 * ColumnPickers are mounted imperatively (one / two / multi depending on the
 * test type); they are not pure-template concerns.
 *
 * Workflow: configuration → normality → (variance check) → routed main test →
 * power analysis (non-k) / pairwise post-hoc (k ≥ 3).
 */

import { createModule } from '../../core/template-module.js';
import { State } from './hypothesis-test-model.js';
import {
  chiSquareVarianceTest, fTest, leveneTest,
  oneSampleTTest, twoSampleTTest, welchTTest,
  wilcoxonSignedRank, mannWhitneyU, hodgesLehmann,
  bonettVarianceTest, bonettRatioTest,
  oneWayANOVA, welchANOVA, tukeyHSD, gamesHowell, leveneTestK, kruskalWallis, bartlettTest,
  powerChiSquare, powerFTest, powerOneSampleT, powerTwoSampleT,
  findRequiredN, pairDifferences, pairedTTest,
} from '../../engines/hypothesis-test-engine.js';
import { shapiroWilk, andersonDarling, descriptiveStats } from '../../engines/normality-test-engine.js';
import { tInv, chi2Inv } from '../../engines/math-utils.js';
import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';

/** Mapping: test name → Algorithm Lab ID. */
import { isNormalByAD, meanRoute, kMeanRoute, varianceRoute, isConstant, ciContains } from './hypothesis-test-routing.js';

const ALGO_LAB_IDS = {
  'Shapiro-Wilk': 'shapiro-wilk',
  'Anderson-Darling': 'anderson-darling',
  'Chi-Square Variance Test': 'chi-square-variance',
  'F-Test': 'f-test',
  'Levene Test (Brown-Forsythe)': 'levene-test',
  'Bonett Variance Test': 'bonett-variance',
  'Bonett Ratio Test': 'bonett-ratio',
  'One-Sample t-Test': 'one-sample-t-test',
  'Two-Sample t-Test (pooled)': 'two-sample-t-test',
  'Welch t-Test': 'welch-t-test',
  'Paired t-Test': 'paired-t-test',
  'Wilcoxon Signed-Rank Test': 'wilcoxon-signed-rank',
  'Mann-Whitney U Test': 'mann-whitney-u',
  'One-Way ANOVA': 'one-way-anova',
  'Welch ANOVA': 'welch-anova',
  'Tukey HSD': 'tukey-hsd',
  'Games-Howell': 'games-howell',
  'Kruskal-Wallis Test': 'kruskal-wallis',
  "Bartlett's Test": 'bartlett-test',
  'Hodges-Lehmann': 'hodges-lehmann',
};

/** @param {number} v @param {number} [d] @returns {string} */
function fmt(v, d = 4) { return v != null && isFinite(v) ? v.toFixed(d) : '–'; }

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

      setCategory(cat) {
        this.model.applyCategory(cat);
        this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });
      },
      setTestType(type) {
        this.model.applyTestType(type);
        this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });
      },
      onAlphaInput(event) {
        const v = parseFloat(event.target.value);
        if (!isNaN(v)) this.model.alpha = v;
        this.runAnalysis();
      },
      onPowerGoalInput(event) {
        this.model.setPowerGoal(event.target.value);
        this.runAnalysis();
      },

      // ── Algorithm Lab link ─────────────────────────────────────

      algoId: (name) => ALGO_LAB_IDS[name] || '',
      algoNavigate(algoId, event) {
        event?.preventDefault();
        event?.stopPropagation();
        if (algoId && module._context?.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      },

      // ── Data retrieval (live worksheet) ────────────────────────

      _pickerValues(picker) {
        if (!picker?.value) return [];
        const raw = getColumnValues(module._context.stateManager, picker.value);
        return raw.filter(v => v != null && typeof v === 'number' && !isNaN(v));
      },
      _valuesForRef(ref) {
        const raw = getColumnValues(module._context.stateManager, ref);
        return raw.filter(v => v != null && typeof v === 'number' && !isNaN(v));
      },
      _refName(ref) {
        return getColumnName(module._context.stateManager, ref);
      },

      // ── CI helpers (thin wrappers over math-utils) ─────────────

      _ciMean(mean, sd, n, alpha) {
        if (n < 2 || !isFinite(sd) || sd <= 0) return null;
        const tCrit = tInv(1 - alpha / 2, n - 1);
        const se = sd / Math.sqrt(n);
        return [mean - tCrit * se, mean + tCrit * se];
      },
      _ciVariance(variance, n, alpha) {
        if (n < 2 || !isFinite(variance) || variance <= 0) return null;
        const lo = (n - 1) * variance / chi2Inv(1 - alpha / 2, n - 1);
        const hi = (n - 1) * variance / chi2Inv(alpha / 2, n - 1);
        return [lo, hi];
      },

      // ── Tooltips (declarative :title; matches legacy _metricTooltips) ──

      _tip(label) {
        const ci = _t('tipConfidenceInterval');
        if (label.endsWith('KI') || label.endsWith('CI')) return ci;
        const map = {
          [_t('testMethod')]: _t('tipTestMethod'),
          [_t('statistic')]: _t('tipStatistic'),
          [_t('currentPower')]: _t('tipCurrentPower'),
          [_t('powerGoal')]: _t('tipPowerGoal'),
          [_t('requiredN')]: _t('tipRequiredN'),
          [_t('varianceRatio')]: _t('tipVarianceRatio'),
          'p': _t('tipPValue'),
          'df': _t('tipDf'),
          'n': _t('tipN'),
          'N': _t('tipBigN'),
          'k': _t('tipK'),
          'x̄': _t('tipMean'),
          'x̄₁': _t('tipMean1'),
          'x̄₂': _t('tipMean2'),
          's': _t('tipStdDev'),
          's²': _t('tipVariance'),
          's²₁': _t('tipVariance1'),
          's²₂': _t('tipVariance2'),
          's²ₚ': _t('tipPooledVar'),
          'α': _t('tipAlpha'),
          'd̄': _t('tipMeanDiff'),
          "Cohen's d": _t('tipCohensD'),
          "Cohen's d_z": _t('tipCohensD'),
          'S': _t('tipModelS'),
          'R²': _t('tipR2'),
          [_t('labelR2adj')]: _t('tipR2adj'),
          [_t('labelR2pred')]: _t('tipR2pred'),
        };
        return map[label] || '';
      },

      // ── Normality card builder ─────────────────────────────────

      _normCard(label, data, sw, ad, isNormal, alpha) {
        const ds = descriptiveStats(data);
        const { mean, stdDev: sd, variance } = ds;
        const n = data.length;
        const ciMean = this._ciMean(mean, sd, n, alpha);
        const ciVar = this._ciVariance(variance, n, alpha);
        const ciSd = ciVar ? [Math.sqrt(ciVar[0]), Math.sqrt(ciVar[1])] : null;
        const ciFmt = (ci) => ci ? `[${fmt(ci[0])}, ${fmt(ci[1])}]` : '';
        // Normality assumption check per test: reject H0 (✗) means the
        // normality assumption is violated, not-reject (✓) means it holds —
        // status.warning/status.ok, not status.error, since a rejected
        // normality assumption is a diagnostic finding, not a computation
        // failure.
        const decisionIcon = (p) => p < alpha ? 'status.warning' : 'status.ok';
        const decisionText = (p) => p < alpha ? _t('reject') : _t('notReject');
        const pCls = (p) => p < alpha ? 'hyptest__text-danger' : 'hyptest__text-success';

        return {
          label: String(label),
          badgeClass: isNormal ? 'hyptest__badge--pass' : 'hyptest__badge--fail',
          badgeText: isNormal ? _t('normal') : _t('notNormal'),
          rows: [
            { name: 'Shapiro-Wilk', algoId: ALGO_LAB_IDS['Shapiro-Wilk'], stat: fmt(sw.statistic), p: fmt(sw.pValue), pClass: pCls(sw.pValue), decisionIcon: decisionIcon(sw.pValue), decisionText: decisionText(sw.pValue) },
            { name: 'Anderson-Darling', algoId: ALGO_LAB_IDS['Anderson-Darling'], stat: fmt(ad.statistic), p: fmt(ad.pValue), pClass: pCls(ad.pValue), decisionIcon: decisionIcon(ad.pValue), decisionText: decisionText(ad.pValue) },
          ],
          metrics: [
            { label: 'n', value: String(n), title: this._tip('n') },
            { label: 'x̄', value: fmt(mean), ci: ciMean ? ciFmt(ciMean) : null, title: this._tip('x̄') },
            { label: 's', value: fmt(sd), ci: ciSd ? ciFmt(ciSd) : null, title: this._tip('s') },
            { label: 's²', value: fmt(variance), ci: ciVar ? ciFmt(ciVar) : null, title: this._tip('s²') },
          ],
        };
      },

      // ── Main test metrics (mirrors legacy _renderMainResult) ───

      _mainResult(r, alpha, target) {
        const s0 = this._sym0();
        const s1 = this._sym1();
        const isVariance = this.model.category === 'variance';
        const isTwo = this.model.testType === 'two';
        const isPaired = this.model.testType === 'paired';
        let h0, h1;
        if (isVariance) {
          h0 = isTwo ? `σ²₁ ${s0} σ²₂` : `σ² ${s0} ${fmt(target)}`;
          h1 = isTwo ? `σ²₁ ${s1} σ²₂` : `σ² ${s1} ${fmt(target)}`;
        } else if (isPaired) {
          h0 = `μ_d ${s0} ${fmt(target)}`;
          h1 = `μ_d ${s1} ${fmt(target)}`;
        } else {
          h0 = isTwo ? `μ₁ ${s0} μ₂` : `μ ${s0} ${fmt(target)}`;
          h1 = isTwo ? `μ₁ ${s1} μ₂` : `μ ${s1} ${fmt(target)}`;
        }

        const pCls = r.pValue < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success';
        const metrics = [
          { label: _t('testMethod'), value: r.testName, algoId: ALGO_LAB_IDS[r.testName] || '', valueClass: 'hyptest__metric-value--sm', title: this._tip(_t('testMethod')) },
          { label: _t('statistic'), value: fmt(r.statistic), valueClass: '', title: this._tip(_t('statistic')) },
          { label: 'p', value: fmt(r.pValue), valueClass: pCls, title: r.method ? `${this._tip('p')} (${r.method === 'exact' ? _t('pMethodExact') : _t('pMethodNormal')})` : this._tip('p') },
        ];
        if (r.df != null) {
          metrics.push({ label: 'df', value: (typeof r.df === 'number' && r.df % 1) ? fmt(r.df, 1) : String(r.df), valueClass: '', title: this._tip('df') });
        }
        const level = Math.round((1 - alpha) * 100);
        const isMeanDiff = !isVariance && isTwo && r.ci != null;
        const fmtCi = (ci) => `[${fmt(ci[0])}, ${fmt(ci[1])}]`;
        if (isVariance && isTwo && r.ratio != null) {
          metrics.push({ label: _t('varianceRatio'), value: fmt(r.ratio), valueClass: '', title: this._tip(_t('varianceRatio')) });
        }
        if (r.ci) {
          const ciLabel = isPaired ? _t('ciPairedDiffLabel', { level })
            : isMeanDiff ? _t('ciDiffLabel', { level })
            : isVariance && isTwo ? _t('ciRatioLabel', { level })
            : _t('ciLabel', { level });
          // Bonett: a confidence set split into disjoint pieces has no interval (Minitab: "(*; *)")
          metrics.push({ label: ciLabel, value: r.ciUndefined ? '–' : fmtCi(r.ci), valueClass: 'hyptest__metric-value--sm', title: this._tip('KI') });
        }
        if (r.ciSigma) {
          metrics.push({ label: _t('ciSigmaLabel', { level }), value: fmtCi(r.ciSigma), valueClass: 'hyptest__metric-value--sm', title: this._tip('KI') });
        }
        if (r.hl) {
          const achieved = fmt(r.hl.achievedConfidence * 100, 1);
          const methodText = r.hl.method === 'exact' ? _t('pMethodExact') : _t('pMethodNormal');
          metrics.push({ label: _t('hlEstimateLabel'), value: fmt(r.hl.estimate), valueClass: '', title: _t('tipHlEstimate'), algoId: ALGO_LAB_IDS['Hodges-Lehmann'] });
          metrics.push({
            label: _t('ciShiftLabel', { level: achieved }),
            value: `[${fmt(r.hl.lower)}, ${fmt(r.hl.upper)}]`,
            valueClass: 'hyptest__metric-value--sm',
            title: _t('ciShiftTip', { level, achieved, method: methodText }),
          });
        }
        if (r.meanDiff != null) {
          metrics.push({ label: 'x̄₁', value: fmt(r.mean1), valueClass: '', title: this._tip('x̄₁') });
          metrics.push({ label: 'x̄₂', value: fmt(r.mean2), valueClass: '', title: this._tip('x̄₂') });
          metrics.push({ label: 'd̄', value: fmt(r.meanDiff), valueClass: '', title: this._tip('d̄') });
        } else if (r.mean != null) {
          metrics.push({ label: 'x̄', value: fmt(r.mean), valueClass: '', title: this._tip('x̄') });
        }
        if (r.meanDiff == null && r.mean1 != null) {
          metrics.push({ label: 'x̄₁', value: fmt(r.mean1), valueClass: '', title: this._tip('x̄₁') });
          metrics.push({ label: 'x̄₂', value: fmt(r.mean2), valueClass: '', title: this._tip('x̄₂') });
        }
        if (r.sampleVariance != null) {
          metrics.push({ label: 's²', value: fmt(r.sampleVariance), valueClass: '', title: this._tip('s²') });
        }
        if (r.variance1 != null && !r.pooledVariance) {
          metrics.push({ label: 's²₁', value: fmt(r.variance1), valueClass: '', title: this._tip('s²₁') });
          metrics.push({ label: 's²₂', value: fmt(r.variance2), valueClass: '', title: this._tip('s²₂') });
        }

        const h0Tip = r.reject
          ? `${_t('h0Rejected')}: p (${fmt(r.pValue)}) < α (${alpha})`
          : `${_t('h0NotRejected')}: p (${fmt(r.pValue)}) ≥ α (${alpha})`;
        const h1Tip = r.reject
          ? `${_t('significant')}: ${_t('h0Rejected')}`
          : `${_t('notSignificant')}: ${_t('h0NotRejected')}`;

        let ciNote = '';
        // A non-rejected one-sided test can leave the target outside the CI
        const ciHoldsTarget = ciContains(r.ci, target ?? 0);
        if (r.ciUndefined) {
          ciNote = _t('ciRatioUndefinedNote');
        } else if (isPaired && r.ci && !r.reject) {
          if (ciHoldsTarget) ciNote = _t('ciPairedDiffNote', { lo: fmt(r.ci[0]), hi: fmt(r.ci[1]) });
        } else if (isMeanDiff && !r.reject) {
          if (ciHoldsTarget) ciNote = _t('ciDiffNote', { lo: fmt(r.ci[0]), hi: fmt(r.ci[1]) });
        } else if (r.hl) {
          const parts = [];
          if (!r.reject) parts.push(_t('ciShiftNote', { lo: fmt(r.hl.lower), hi: fmt(r.hl.upper) }));
          if (r.hl.K === 1 && r.hl.achievedConfidence > 0 && r.hl.achievedConfidence < 1 - alpha - 1e-9) {
            parts.push(_t('ciShiftTooSmall', { level, achieved: fmt(r.hl.achievedConfidence * 100, 1) }));
          }
          ciNote = parts.join(' ');
        }

        return {
          h0, h1, ciNote,
          h0Class: r.reject ? 'hyptest__h-box--rejected' : 'hyptest__h-box--accepted',
          h1Class: r.reject ? 'hyptest__h-box--accepted' : 'hyptest__h-box--rejected',
          h0Tip, h1Tip,
          metrics,
        };
      },

      // ── Rank test shown next to a large-n parametric result ──

      _secondaryResult(r, alpha, { title = _t('sectionSecondary'), note = _t('secondaryNote'), showTwoSidedSuffix = false } = {}) {
        const pCls = r.pValue < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success';
        const methodLabel = showTwoSidedSuffix ? `${_t('testMethod')} (${_t('twoSidedSuffix')})` : _t('testMethod');
        return {
          metrics: [
            { label: methodLabel, value: r.testName, algoId: ALGO_LAB_IDS[r.testName] || '', valueClass: 'hyptest__metric-value--sm', title: this._tip(_t('testMethod')) },
            { label: _t('statistic'), value: fmt(r.statistic), valueClass: '', title: this._tip(_t('statistic')) },
            { label: 'p', value: fmt(r.pValue), valueClass: pCls, title: this._tip('p') },
          ],
          title,
          note,
        };
      },

      // ── Variance-equality card (k-sample mean) ──

      _varEqualityCard(veResult, varsEqual, alpha, withDf) {
        const pCls = veResult.pValue < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success';
        const metrics = [
          { label: _t('testMethod'), value: veResult.testName, algoId: ALGO_LAB_IDS[veResult.testName] || '', valueClass: 'hyptest__metric-value--sm', title: this._tip(_t('testMethod')) },
          { label: _t('statistic'), value: fmt(veResult.statistic), valueClass: '', title: this._tip(_t('statistic')) },
        ];
        if (withDf) {
          metrics.push({ label: 'df', value: `${veResult.df1} / ${veResult.df2}`, valueClass: '', title: this._tip('df') });
        }
        metrics.push({ label: 'p', value: fmt(veResult.pValue), valueClass: pCls, title: this._tip('p') });
        if (!withDf) {
          metrics.push({ label: 's²₁', value: fmt(veResult.variance1), valueClass: '', title: this._tip('s²₁') });
          metrics.push({ label: 's²₂', value: fmt(veResult.variance2), valueClass: '', title: this._tip('s²₂') });
        }
        return { metrics, varsEqual };
      },

      // ── Power analysis (non-k; mirrors legacy _renderPower) ────

      _powerInfo(d1, d2, target, alpha) {
        const dir = this.model.direction;
        const n1 = d1.length;
        const goal = this.model.powerGoal;
        const ds = (a) => descriptiveStats(a);
        let curPow, curEff, effLabel, nForGoal;

        if (this.model.category === 'variance') {
          if (this.model.testType === 'one') {
            const s2 = ds(d1).variance;
            curEff = s2 / target;
            curPow = powerChiSquare(n1, target, s2, alpha, dir);
            effLabel = _t('varianceRatio');
            nForGoal = findRequiredN(goal, n => powerChiSquare(n, target, s2, alpha, dir));
          } else {
            const s1 = ds(d1).variance, s2 = ds(d2).variance;
            curEff = s1 / s2;
            curPow = powerFTest(n1, d2.length, curEff, alpha, dir);
            effLabel = _t('varianceRatio');
            nForGoal = findRequiredN(goal, n => powerFTest(n, n, curEff, alpha, dir));
          }
        } else {
          const sigma = ds(d1).stdDev;
          if (this.model.testType === 'one' || this.model.testType === 'paired') {
            const delta = Math.abs(ds(d1).mean - target);
            curEff = sigma > 0 ? delta / sigma : 0;
            curPow = powerOneSampleT(n1, delta, sigma, alpha, dir);
            effLabel = this.model.testType === 'paired' ? "Cohen's d_z" : "Cohen's d";
            nForGoal = findRequiredN(goal, n => powerOneSampleT(n, delta, sigma, alpha, dir));
          } else {
            const delta = Math.abs(ds(d1).mean - ds(d2).mean);
            const sp = Math.sqrt(((d1.length - 1) * ds(d1).variance + (d2.length - 1) * ds(d2).variance) / (d1.length + d2.length - 2));
            curEff = sp > 0 ? delta / sp : 0;
            curPow = powerTwoSampleT(n1, d2.length, delta, sp, alpha, dir);
            effLabel = "Cohen's d";
            nForGoal = findRequiredN(goal, n => powerTwoSampleT(n, n, delta, sp, alpha, dir));
          }
        }

        const goalPct = (goal * 100).toFixed(0);
        const goalReached = curPow >= goal;
        const nDisplay = nForGoal >= 5000 ? '> 5000' : String(nForGoal);
        const requiredLine = `${_t('requiredN')}${d2 ? ` (${  _t('perGroup')  })` : ''}: ${nDisplay}`
          + ` — ${goalReached ? `✓ ${  _t('achieved')}` : `✗ ${  _t('notAchieved')}`}`;

        return {
          goalPct,
          goalBoxClass: goalReached ? 'hyptest__decision--accept' : 'hyptest__decision--warn',
          requiredLine,
          note: '',
          metrics: [
            { label: _t('currentPower'), value: `${(curPow * 100).toFixed(1)}%`, valueClass: goalReached ? 'hyptest__metric-value--success' : 'hyptest__metric-value--warning', title: this._tip(_t('currentPower')) },
            { label: 'n', value: `${n1}${d2 ? ` / ${  d2.length}` : ''}`, valueClass: '', title: this._tip('n') },
            { label: effLabel, value: fmt(curEff, 3), valueClass: '', title: this._tip(effLabel) },
            { label: 'α', value: String(alpha), valueClass: '', title: this._tip('α') },
          ],
        };
      },

      // ── Analysis controller ────────────────────────────────────

      runAnalysis() {
        this.errorText = '';
        if (this.model.testType === 'k') return this._runAnalysisK();
        if (this.model.testType === 'paired') return this._runAnalysisPaired();
        return this._runAnalysisOneTwo();
      },

      _runAnalysisPaired() {
        const alpha = this.model.alpha;
        if (!this._picker1?.value || !this._picker2?.value) { this.result = null; return; }
        const sm = module._context.stateManager;
        const { x1, x2, d, dropped } = pairDifferences(
          getColumnValues(sm, this._picker1.value),
          getColumnValues(sm, this._picker2.value));
        if (d.length < 3) {
          this.result = null;
          this.errorText = _t('pairedTooFew', { count: d.length, n: d.length });
          return;
        }
        const target = this.model.resolveTarget();
        if (target == null) { this.result = null; return; }
        // Identical columns (or a constant shift) leave no variation to test
        if (isConstant(d)) {
          this.result = null;
          this.errorText = _t('pairedNoVariation');
          return;
        }

        const sw = shapiroWilk(d), ad = andersonDarling(d);
        const dNormal = isNormalByAD(ad, alpha);
        const family = meanRoute(dNormal, [d.length]);
        const dir = this.model.direction;
        const means = { mean1: descriptiveStats(x1).mean, mean2: descriptiveStats(x2).mean };

        let r, algoName;
        if (family === 'rank') {
          algoName = 'Wilcoxon Signed-Rank Test';
          r = { ...wilcoxonSignedRank(d, target, dir, alpha), ...means, meanDiff: descriptiveStats(d).mean };
        } else {
          algoName = 'Paired t-Test';
          r = pairedTTest(x1, x2, target, dir, alpha);
        }

        let secondary = null;
        if (family === 'parametric-large-n') {
          secondary = this._secondaryResult(wilcoxonSignedRank(d, target, dir, alpha), alpha);
        }

        this.result = {
          isK: false,
          allNormal: dNormal,
          normCards: [this._normCard(_t('differences'), d, sw, ad, dNormal, alpha)],
          route: { name: algoName, algoId: ALGO_LAB_IDS[algoName] || '' },
          varEquality: null,
          main: this._mainResult(r, alpha, target),
          secondary,
          power: this._powerInfo(d, null, target, alpha),
          pairwise: null,
          residualPlot: null,
          pairInfo: { n: d.length, dropped },
        };
      },

      _runAnalysisOneTwo() {
        const alpha = this.model.alpha;
        const d1 = this._pickerValues(this._picker1);
        if (d1.length < 3) { this.result = null; return; }

        let d2 = null;
        if (this.model.testType === 'two') {
          d2 = this._pickerValues(this._picker2);
          if (d2.length < 3) { this.result = null; return; }
        }

        let target = null;
        if (this.model.testType === 'one') {
          target = this.model.resolveTarget();
          if (target == null) { this.result = null; return; }
        }

        // Normality
        // The normality engines throw on a constant sample (zero variance)
        let sw1, ad1, n1Normal, sw2 = null, ad2 = null, n2Normal = true;
        try {
          sw1 = shapiroWilk(d1); ad1 = andersonDarling(d1);
          n1Normal = isNormalByAD(ad1, alpha);
          if (d2) {
            sw2 = shapiroWilk(d2); ad2 = andersonDarling(d2);
            n2Normal = isNormalByAD(ad2, alpha);
          }
        } catch (err) {
          console.error('[hypothesis-test] normality check failed:', err);
          this.result = null;
          this.errorText = _t('testNotComputable');
          return;
        }
        const allNormal = n1Normal && n2Normal;

        // Route
        let algo;
        let meanFamily = null;
        if (this.model.category === 'variance') {
          const VARIANCE_ALGOS = {
            chi2: { id: 'chi2', name: 'Chi-Square Variance Test' },
            bonett1: { id: 'bonett1', name: 'Bonett Variance Test' },
            ftest: { id: 'ftest', name: 'F-Test' },
            bonett2: { id: 'bonett2', name: 'Bonett Ratio Test' },
          };
          algo = VARIANCE_ALGOS[varianceRoute(this.model.testType, allNormal)];
        } else if (this.model.testType === 'one') {
          meanFamily = meanRoute(n1Normal, [d1.length]);
          algo = meanFamily === 'rank'
            ? { id: 'wilcoxon', name: 'Wilcoxon Signed-Rank Test' }
            : { id: 'ttest1', name: 'One-Sample t-Test' };
        } else {
          algo = { id: 'pending', name: '' };
        }

        // Two-sample mean: Welch by default; the pooled t-test only when the
        // user assumes equal variances. No variance pretest decides the route
        // (C1-006: sequential pretesting distorts the type I error).
        let varEquality = null;
        if (this.model.category === 'mean' && this.model.testType === 'two') {
          meanFamily = meanRoute(allNormal, [d1.length, d2.length]);
          if (meanFamily !== 'rank') {
            const varsEqual = this.model.equalVariances === true;
            varEquality = { varsEqual, metrics: null, trailLabelKey: 'varEqualLabel', trailYes: varsEqual };
            algo = varsEqual
              ? { id: 'ttest2p', name: 'Two-Sample t-Test (pooled)' }
              : { id: 'welch', name: 'Welch t-Test' };
          } else {
            algo = { id: 'mannwhitney', name: 'Mann-Whitney U Test' };
          }
        }

        // Run main test
        const dir = this.model.direction;
        let r;
        try {
          if (algo.id === 'chi2') r = chiSquareVarianceTest(d1, target, dir, alpha);
          else if (algo.id === 'ftest') r = fTest(d1, d2, dir, alpha);
          else if (algo.id === 'bonett1') r = bonettVarianceTest(d1, target, dir, alpha);
          else if (algo.id === 'bonett2') r = bonettRatioTest(d1, d2, dir, alpha);
          else if (algo.id === 'ttest1') r = oneSampleTTest(d1, target, dir, alpha);
          else if (algo.id === 'wilcoxon') r = wilcoxonSignedRank(d1, target, dir, alpha);
          else if (algo.id === 'ttest2p') r = twoSampleTTest(d1, d2, dir, alpha);
          else if (algo.id === 'welch') r = welchTTest(d1, d2, dir, alpha);
          else if (algo.id === 'mannwhitney') r = mannWhitneyU(d1, d2, dir, alpha);
        } catch (err) {
          // Bonett's CI is undefined for degenerate samples (no spread, tiny n)
          console.error('[hypothesis-test] test computation failed:', err);
          this.result = null;
          this.errorText = _t('testNotComputable');
          return;
        }
        // Shift estimate and CI for the rank test (two-sided, like the t CIs)
        if (algo.id === 'mannwhitney') r = { ...r, hl: hodgesLehmann(d1, d2, alpha) };

        // Large-n parametric route: the rank test is shown alongside (C1-017)
        let secondary = null;
        if (meanFamily === 'parametric-large-n') {
          secondary = this._secondaryResult(d2
            ? mannWhitneyU(d1, d2, dir, alpha)
            : wilcoxonSignedRank(d1, target, dir, alpha), alpha);
        }
        // Two-sample Bonett: Levene alongside, as Minitab's "2 Variances" shows both
        if (algo.id === 'bonett2') {
          secondary = this._secondaryResult(leveneTest(d1, d2, alpha), alpha, {
            title: _t('sectionSecondaryLevene'),
            note: _t('secondaryNoteLevene'),
            showTwoSidedSuffix: dir !== 'two-sided',
          });
        }

        const normCards = [this._normCard('S1', d1, sw1, ad1, n1Normal, alpha)];
        if (d2) normCards.push(this._normCard('S2', d2, sw2, ad2, n2Normal, alpha));

        const power = this._powerInfo(d1, d2, target, alpha);
        power.note = (algo.id === 'bonett1' || algo.id === 'bonett2') ? _t('powerNormalApprox') : '';

        this.result = {
          isK: false,
          allNormal,
          normCards,
          route: { name: algo.name, algoId: ALGO_LAB_IDS[algo.name] || '' },
          varEquality,
          main: this._mainResult(r, alpha, target),
          secondary,
          power,
          pairwise: null,
          residualPlot: null,
        };
      },

      _runAnalysisK() {
        const refs = this._pickerK?.value || [];
        const groups = refs.map(ref => this._valuesForRef(ref));
        if (groups.length < 2 || groups.some(g => g.length < 3)) { this.result = null; return; }

        const alpha = this.model.alpha;
        const isVariance = this.model.category === 'variance';

        // The normality engines throw on a constant group; Welch ANOVA throws on
        // a zero-variance group or n_i < 2 — shown as "not computable", as for
        // one and two samples.
        let sws, ads, groupNormal, allNormal;
        let algo, r, varEquality = null, secondary = null, parametric, meanTest = null;
        try {
          sws = groups.map(g => shapiroWilk(g));
          ads = groups.map(g => andersonDarling(g));
          groupNormal = ads.map(ad => isNormalByAD(ad, alpha));
          allNormal = groupNormal.every(Boolean);
          parametric = allNormal;

          if (isVariance) {
            if (allNormal) { algo = { name: "Bartlett's Test" }; r = bartlettTest(groups, alpha); }
            else { algo = { name: 'Levene Test (Brown-Forsythe)' }; r = leveneTestK(groups, alpha); }
          } else {
            // Welch by default, Fisher only when the user assumes equal variances.
            // Levene is shown for information; no variance pretest picks the
            // route (C1-006, C1-019). The trail reports the assumption.
            const equalVariances = this.model.equalVariances === true;
            const lev = leveneTestK(groups, alpha);
            varEquality = {
              ...this._varEqualityCard(lev, !lev.reject, alpha, true),
              trailLabelKey: 'varEqualLabel', trailYes: equalVariances,
            };
            const sizes = groups.map(g => g.length);
            meanTest = kMeanRoute(allNormal, sizes, equalVariances);
            parametric = meanTest !== 'kruskal';
            if (meanTest === 'fisher') { algo = { name: 'One-Way ANOVA' }; r = oneWayANOVA(groups, alpha); }
            else if (meanTest === 'welch') { algo = { name: 'Welch ANOVA' }; r = welchANOVA(groups, alpha); }
            else { algo = { name: 'Kruskal-Wallis Test' }; r = kruskalWallis(groups, alpha); }
            if (meanRoute(allNormal, sizes) === 'parametric-large-n') {
              secondary = this._secondaryResult(kruskalWallis(groups, alpha), alpha);
            }
          }
        } catch (err) {
          console.error('[hypothesis-test] k-group test computation failed:', err);
          this.result = null;
          this.errorText = _t('testNotComputable');
          return;
        }

        let pairwise = null;
        if (groups.length >= 3) {
          if (meanTest === 'fisher' || meanTest === 'welch') {
            // A failing post-hoc hides the section; the omnibus result stays
            try {
              pairwise = this._simultaneousPairwise(groups, alpha, meanTest);
            } catch (err) {
              console.error('[hypothesis-test] pairwise comparisons failed:', err);
              pairwise = null;
            }
          } else {
            pairwise = this._computePairwise(groups, alpha, isVariance, parametric);
          }
        }

        const normCards = groups.map((g, i) =>
          this._normCard(this._refName(refs[i]), g, sws[i], ads[i], groupNormal[i], alpha));

        const hasResiduals = meanTest === 'fisher' || meanTest === 'welch';
        this.result = {
          isK: true,
          allNormal,
          normCards,
          route: { name: algo.name, algoId: ALGO_LAB_IDS[algo.name] || '' },
          varEquality,
          main: this._kMainResult(r, refs, groups, alpha, pairwise),
          secondary,
          power: null,
          pairwise: pairwise ? this._pairwiseSection(pairwise, refs, groups, alpha) : null,
          residualPlot: hasResiduals ? { residuals: r.residuals, fitted: r.fitted } : null,
        };
      },

      _kMainResult(r, refs, groups, alpha, pairwise) {
        const isAnova = r.testName === 'One-Way ANOVA';
        const isVariance = this.model.category === 'variance';
        const has2Df = r.df1 != null && r.df2 != null;
        const h0 = isVariance ? 'σ²₁ = σ²₂ = … = σ²ₖ' : 'μ₁ = μ₂ = … = μₖ';
        const h1 = isVariance ? _t('kSampleVarH1') : _t('kSampleH1');
        // Welch's df2 is fractional (Satterthwaite-type)
        const df2Display = has2Df && r.testName === 'Welch ANOVA' ? fmt(r.df2, 2) : String(r.df2);
        const dfDisplay = has2Df ? `${r.df1} / ${df2Display}` : String(r.df);
        const pCls = r.pValue < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success';

        const metrics = [
          { label: _t('testMethod'), value: r.testName, algoId: ALGO_LAB_IDS[r.testName] || '', valueClass: 'hyptest__metric-value--sm', title: this._tip(_t('testMethod')) },
          { label: _t('statistic'), value: fmt(r.statistic), valueClass: '', title: this._tip(_t('statistic')) },
          { label: 'df', value: dfDisplay, valueClass: '', title: this._tip('df') },
          { label: 'p', value: fmt(r.pValue), valueClass: pCls, title: this._tip('p') },
          { label: 'k', value: String(r.k), valueClass: '', title: this._tip('k') },
        ];
        if (r.N != null) metrics.push({ label: 'N', value: String(r.N), valueClass: '', title: this._tip('N') });
        if (r.pooledVariance != null) metrics.push({ label: 's²ₚ', value: fmt(r.pooledVariance), valueClass: '', title: this._tip('s²ₚ') });

        let anovaRows = null;
        if (isAnova) {
          const dCls = r.pValue < alpha ? 'hyptest__text-danger' : 'hyptest__text-success';
          anovaRows = [
            { src: _t('between'), ss: fmt(r.SSB), df: String(r.df1), ms: fmt(r.MSB), f: fmt(r.statistic), p: fmt(r.pValue), pClass: dCls, bold: false },
            { src: _t('within'), ss: fmt(r.SSW), df: String(r.df2), ms: fmt(r.MSW), f: '—', p: '—', pClass: '', bold: false },
            { src: _t('total'), ss: fmt(r.SST), df: String(r.df1 + r.df2), ms: '—', f: '—', p: '—', pClass: '', bold: true },
          ];
        }

        const letters = pairwise?.letters || [];
        const showCld = letters.length > 0;
        const groupCIs = Array.isArray(r.groupCIs) ? r.groupCIs : null;
        const groupRows = groups.map((g, i) => {
          const ds = descriptiveStats(g);
          const ci = groupCIs ? `[${fmt(groupCIs[i][0])}, ${fmt(groupCIs[i][1])}]` : '';
          return { name: this._refName(refs[i]), n: String(g.length), mean: fmt(ds.mean), variance: fmt(ds.variance), ci, letters: letters[i] || '' };
        });

        return {
          h0, h1,
          h0Class: r.reject ? 'hyptest__h-box--rejected' : 'hyptest__h-box--accepted',
          h1Class: r.reject ? 'hyptest__h-box--accepted' : 'hyptest__h-box--rejected',
          h0Tip: '', h1Tip: '',
          metrics,
          anovaRows,
          modelSummary: r.S != null ? this._modelSummary(r) : null,
          groupRows,
          showCi: groupCIs !== null,
          ciHeader: _t('groupCi', { level: Math.round((1 - alpha) * 100) }),
          showCld,
        };
      },

      /**
       * Minitab-style model summary of the one-way fit (C1-020): S with four
       * decimals, R² values as percentages with two, R²(adj) and R²(pred)
       * clamped at 0 %; R²(pred) is undefined when a group has one value.
       * @param {{S: number, R2: number, R2adj: number, R2pred: (number|null)}} r
       * @returns {{label: string, value: string, title: string}[]}
       */
      _modelSummary(r) {
        const pct = (v) => (v != null && isFinite(v) ? `${(Math.max(0, v) * 100).toFixed(2)} %` : '–');
        const row = (label, value) => ({ label, value, title: this._tip(label) });
        return [
          row('S', fmt(r.S)),
          row('R²', pct(r.R2)),
          row(_t('labelR2adj'), pct(r.R2adj)),
          row(_t('labelR2pred'), pct(r.R2pred)),
        ];
      },

      // ── Pairwise post-hoc ──

      /**
       * Simultaneous all-pairs comparisons for the parametric k-group routes:
       * Tukey HSD with Fisher, Games-Howell with Welch. Throws when the
       * engine does (zero variance, n_i < 2).
       * @param {number[][]} groups
       * @param {number} alpha
       * @param {'fisher'|'welch'} meanTest
       */
      _simultaneousPairwise(groups, alpha, meanTest) {
        const res = meanTest === 'fisher' ? tukeyHSD(groups, alpha) : gamesHowell(groups, alpha);
        const comparisons = res.comparisons.map(c => ({
          i: c.i, j: c.j, p: null, pAdj: c.pAdj, ci: c.ci, equal: c.pAdj >= alpha,
        }));
        const letters = this._compactLetterDisplay(groups.length, comparisons);
        return { comparisons, letters, m: comparisons.length, methodName: res.testName, isRank: false, simultaneous: true };
      },

      /** Bonferroni pairwise tests: variance questions and the rank route. */
      _computePairwise(groups, alpha, isVariance, isNormal) {
        const k = groups.length;
        const m = k * (k - 1) / 2;
        const methodName = isVariance
          ? (isNormal ? 'F-Test' : 'Levene Test (Brown-Forsythe)')
          : 'Mann-Whitney U Test';

        const comparisons = [];
        for (let i = 0; i < k; i++) {
          for (let j = i + 1; j < k; j++) {
            let r;
            if (isVariance) {
              r = isNormal ? fTest(groups[i], groups[j], 'two-sided', alpha) : leveneTest(groups[i], groups[j], alpha);
            } else {
              r = mannWhitneyU(groups[i], groups[j], 'two-sided', alpha);
            }
            const p = r.pValue;
            const pAdj = Math.min(1, p * m);
            // Bonferroni Hodges-Lehmann CI of the shift at alpha/m (rank path)
            let ci = null;
            if (!isVariance) {
              const hl = hodgesLehmann(groups[i], groups[j], alpha / m);
              ci = [hl.lower, hl.upper];
            }
            comparisons.push({ i, j, p, pAdj, ci, equal: pAdj >= alpha });
          }
        }
        const letters = this._compactLetterDisplay(k, comparisons);
        return { comparisons, letters, m, methodName, isRank: !isVariance, simultaneous: false };
      },

      _compactLetterDisplay(k, comparisons) {
        const adj = Array.from({ length: k }, () => new Set());
        for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j) adj[i].add(j);
        for (const c of comparisons) {
          if (!c.equal) { adj[c.i].delete(c.j); adj[c.j].delete(c.i); }
        }
        const cliques = [];
        const bk = (R, P, X) => {
          if (P.size === 0 && X.size === 0) { cliques.push([...R].sort((a, b) => a - b)); return; }
          for (const v of [...P]) {
            const N = adj[v];
            bk(new Set([...R, v]), new Set([...P].filter(x => N.has(x))), new Set([...X].filter(x => N.has(x))));
            P.delete(v); X.add(v);
          }
        };
        bk(new Set(), new Set(Array.from({ length: k }, (_, i) => i)), new Set());
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
        for (let i = 0; i < k; i++) {
          if (letters[i] === '') letters[i] = String.fromCharCode(97 + unique.length + i);
        }
        return letters;
      },

      _pairwiseSection(pairwise, refs, groups, alpha) {
        const { comparisons, m, methodName, letters, isRank, simultaneous } = pairwise;
        const k = groups.length;
        const find = (i, j) => comparisons.find(c => (c.i === i && c.j === j) || (c.i === j && c.j === i));
        const headers = refs.map(ref => this._refName(ref));
        const rows = [];
        for (let i = 0; i < k; i++) {
          const cells = [];
          for (let j = 0; j < k; j++) {
            if (j <= i) {
              cells.push({ cls: 'hyptest__pairwise-empty', title: '', text: '—', ci: '', key: `${i}-${j}` });
            } else {
              const c = find(i, j);
              const cls = c.equal ? 'hyptest__pairwise-equal' : 'hyptest__pairwise-diff';
              const verdict = c.equal ? _t('pairwiseEqual') : _t('pairwiseDifferent');
              // Tukey / Games-Howell yield adjusted p-values only
              const tip = c.p != null
                ? `p=${fmt(c.p)}  ·  p_adj=${fmt(c.pAdj)}  ·  ${verdict}`
                : `p_adj=${fmt(c.pAdj)}  ·  ${verdict}`;
              const ci = c.ci ? `[${fmt(c.ci[0])}, ${fmt(c.ci[1])}]` : '';
              cells.push({ cls, title: tip, text: fmt(c.pAdj), ci, key: `${i}-${j}` });
            }
          }
          rows.push({ head: this._refName(refs[i]), cells });
        }
        const methodHint = simultaneous
          ? _t('pairwiseSimultaneousHint', { level: Math.round((1 - alpha) * 100) })
          : _t('pairwiseHint', { m });
        return {
          methodName,
          methodAlgoId: ALGO_LAB_IDS[methodName] || '',
          hint: comparisons.some(c => c.ci)
            ? `${methodHint}; ${_t(isRank ? 'pairwiseShiftCiHint' : 'pairwiseCiHint')}`
            : methodHint,
          headers,
          rows,
          lettersJoined: letters.join(', '),
        };
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
            onChange: (ref) => { this.model.colRef1 = ref; this.runAnalysis(); },
          });
          if (this.model.colRef1) this._picker1.value = this.model.colRef1;
        }

        const wrap2 = c.querySelector('[data-ref="picker2-wrap"]');
        if (wrap2) {
          this._picker2 = new ColumnPicker(wrap2, ctx, {
            mode: 'single', types: ['numeric'], minCount: 3,
            onChange: (ref) => { this.model.colRef2 = ref; this.runAnalysis(); },
          });
          if (this.model.colRef2) this._picker2.value = this.model.colRef2;
        }

        const wrapK = c.querySelector('[data-ref="picker-k-wrap"]');
        if (wrapK) {
          this._pickerK = new ColumnPicker(wrapK, ctx, {
            mode: 'multi', types: ['numeric'], minCount: 3,
            onChange: (refs) => { this.model.colRefsK = refs; this.runAnalysis(); },
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

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._disposePickers();
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
    rewriteRefs(data, instanceId) {
      const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId } : r;
      const out = { ...data };
      if (out.colRef1) out.colRef1 = rewrite(out.colRef1);
      if (out.colRef2) out.colRef2 = rewrite(out.colRef2);
      if (Array.isArray(out.colRefsK)) out.colRefsK = out.colRefsK.map(rewrite);
      return out;
    },
  });
};

export default mod;
