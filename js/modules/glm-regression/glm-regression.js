/**
 * D.Mike — GLM Regression Module (glm-regression.js)
 * Improve phase: Generalized Linear Models for attributive/count data.
 *
 * Migrated to createModule + Alpine CSP. The Model (glm-regression-model.js)
 * holds the persistent configuration + the slim persisted fit result + thin
 * worksheet/column helpers. ALL GLM statistics stay in `engines/glm-engine.js`
 * — nothing is reimplemented here. The full fit result is derived transiently
 * in the view (`result`) and rebuilt declaratively into a plain view-model;
 * no UI HTML is built in JS. The only imperative widgets are the ColumnPicker
 * and the chartManager residual/QQ/Cook's/ROC scatters (sanctioned chart tier).
 *
 * Cross-module: `saveAsModel()` writes the fitted GLM to the project-central
 * models-store (`saveModel`) with the exact legacy record shape so the
 * response-optimization module can reference it. The write happens at the same
 * point (the "Save as model" button) and with the same object shape as legacy.
 *
 * Supports: binary logistic (binomial/logit), Poisson (log, with quasi-Poisson
 * refit on overdispersion), negative binomial (log), and auto-detect.
 */

import { createModule } from '../../core/template-module.js';
import { State, keyToRef } from './glm-regression-model.js';
import {
  fitGLM, buildGLMDesignMatrix, predictGLM,
  computeROC, classificationTable, hosmerLemeshow,
  overdispersionCheck, hatValues, cookDistance, computeGLMVIF,
  normalOrderStats,
} from '../../engines/glm-engine.js';
import {
  ColumnPicker, discoverColumns, refToKey, isPickerFocused,
} from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';
import { saveModel, buildDataSnapshot, computeDataHash } from '../../core/models-store.js';

// ── Unicode glyphs carried over from the legacy innerHTML (kept out of x-text
// literals — Alpine CSP would emit \u-escapes verbatim). ──────────────
const EN_DASH = '–';     // –
const SWAP = '↔';        // ↔
const THETA = 'θ';       // θ
const CHI2 = 'χ²';       // χ²
const WARN = '⚠';        // ⚠

/** @param {number} v @param {number} d */
function fmt(v, d = 4) {
  if (v == null || !isFinite(v)) return EN_DASH;
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d);
  return v.toFixed(d);
}
function fmtP(p) { return p < 0.0001 ? '< 0.0001' : p.toFixed(4); }
function sigClass(p) {
  if (p < 0.001) return 'glm__sig--high';
  if (p < 0.01) return 'glm__sig--med';
  if (p < 0.05) return 'glm__sig--low';
  return 'glm__sig--none';
}
function sigStars(p) {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

const mod = createModule({
  config: {
    id: 'glm-regression',
    engine: 'alpine',
    phase: 'improve',
    allowedPhases: ['analyze', 'improve'],
    icon: 'git-branch',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (never persisted) ───────────────
      result: null,         // full fit view-model (or null)
      _fit: null,           // raw engine fit result (for charts/prediction)
      predictResult: null,
      predictError: null,
      _detectKey: null,     // auto-detect reason key (transient)
      _detectVisible: false,
      _classCutoff: 0.5,    // current classification cutoff (mirrors model.cutoff)
      _classCache: null,    // classification table for the current cutoff
      _errorKey: null,
      _errorText: '',
      _picker: null,
      _charts: [],
      _unsubs: [],
      _renderGen: 0,
      _successInfo: null,
      /** Per-anchor chart-render error messages (declarative — x-if/x-text). */
      chartErrors: { residuals: '', qq: '', cooks: '', roc: '' },

      /** Error message for a given chart anchor (empty string when none). */
      chartErr(key) { return this.chartErrors[key] || ''; },

      sm() { return module._context?.stateManager; },

      // ── Column option lists (data-driven; selects NOT x-model-bound) ──
      yOptions() {
        const selected = new Set(this.model.colRefs.map(r => refToKey(r)));
        const all = discoverColumns(this.sm(), { minCount: 1 });
        const out = [];
        for (const col of all) {
          const key = refToKey({ instanceId: col.instanceId, sheetId: col.sheetId, columnId: col.columnId });
          if (selected.has(key)) continue;
          out.push({ key, name: col.columnName || col.shortName || '?' });
        }
        return out;
      },
      trialsOptions() {
        // Trials dropdown also excludes the Y column (same column can't be both).
        return this.yOptions().filter(o => o.key !== this.model.yKey);
      },

      // ── Method radio ─────────────────────────────────────────
      methodRadioName() { return `glm-method-${  module._context.instanceId}`; },

      // ── Detect-info box ──────────────────────────────────────
      detectInfoText() { return this._detectKey ? _t(this._detectKey) : ''; },
      detectInfoClass() { return this._detectVisible ? 'glm__detect-info--visible' : ''; },

      // ── Conf / alpha display ─────────────────────────────────
      confDisplay() {
        const c = this.model.confLevel;
        return c == null ? '' : String(Number((c * 100).toFixed(2)));
      },
      alphaDisplay() {
        const a = this.model.alpha;
        return a == null ? '' : String(Number((a * 100).toFixed(2)));
      },

      // ── Error box ────────────────────────────────────────────
      errorText() { return this._errorKey ? this._errorText : ''; },
      errorStyle() { return this._errorKey ? 'display:block' : 'display:none'; },
      resultsStyle() { return this.result ? '' : 'display:none'; },
      cutoffDisplay() { return this._classCutoff.toFixed(2); },

      // ── Tabs ─────────────────────────────────────────────────
      tabs() {
        const list = [
          { id: 'model', label: _t('tabModel') },
          { id: 'diagnostics', label: _t('tabDiagnostics') },
        ];
        if (this._fit && this._fit.family.name === 'binomial') list.push({ id: 'roc', label: _t('tabROC') });
        list.push({ id: 'prediction', label: _t('tabPrediction') });
        return list;
      },

      // ── Prediction inputs ────────────────────────────────────
      predictionTerms() {
        const r = this._fit;
        if (!r) return [];
        const out = [];
        for (let j = 1; j < r.terms.length; j++) out.push({ idx: j, label: r.terms[j] });
        return out;
      },

      // ── Classification view (recomputed at the current cutoff) ──
      classView() {
        const r = this._fit;
        if (!r || r.family.name !== 'binomial') {
          return { tp: '', fn: '', fp: '', tn: '', metrics: [] };
        }
        const ct = this._classCache || classificationTable(r.y, r.fittedValues, this._classCutoff);
        return {
          tp: ct.tp, fn: ct.fn, fp: ct.fp, tn: ct.tn,
          metrics: [
            { label: _t('sensitivity'), value: fmt(ct.sensitivity, 4) },
            { label: _t('specificity'), value: fmt(ct.specificity, 4) },
            { label: _t('accuracy'), value: fmt(ct.accuracy, 4) },
            { label: _t('precision'), value: fmt(ct.precision, 4) },
          ],
        };
      },

      // ── Event handlers ───────────────────────────────────────
      onYChange(event) {
        this.model.yKey = event.target.value || null;
        if (this.model.yKey && this.model.trialsKey === this.model.yKey) this.model.trialsKey = null;
        this.autoRun();
      },
      onTrialsChange(event) {
        this.model.trialsKey = event.target.value || null;
        this.autoRun();
      },
      onMethodChange(event) {
        if (event.target.name?.startsWith('glm-method')) {
          this.model.method = event.target.value;
          this.autoRun();
        }
      },
      // confLevel is the single source of truth; alpha mirrors it.
      onConfChange(event) {
        const v = parseFloat(event.target.value);
        if (v > 0 && v < 100) {
          this.model.confLevel = v / 100;
          this.model.alpha = 1 - this.model.confLevel;
          this.autoRun();
        }
      },
      onAlphaChange(event) {
        const v = parseFloat(event.target.value);
        if (v > 0 && v < 100) {
          this.model.confLevel = 1 - v / 100;
          this.model.alpha = v / 100;
          this.autoRun();
        }
      },
      switchTab(tabId) {
        this._renderGen++;
        this.destroyCharts();
        this.model.activeTab = tabId;
        this.$nextTick(() => this.renderActiveChart());
      },
      onRouteChanged(sub) {
        const key = Array.isArray(sub) && sub.length ? sub[0] : null;
        if (!key || key === this.model.activeTab) return;
        if (!this.tabs().some(tb => tb.id === key)) return;
        this.switchTab(key);
      },
      swapSuccess() {
        const info = this._fit?._successClassInfo;
        if (!info) return;
        this.model.successClass = info.failure;
        this.runAnalysis();
      },
      onCutoff(event) {
        this._classCutoff = parseFloat(event.target.value);
        this.model.cutoff = this._classCutoff;
        const r = this._fit;
        if (r) {
          this._classCache = classificationTable(r.y, r.fittedValues, this._classCutoff);
          r._classTable = this._classCache;
        }
      },

      // ── Auto-run gate ────────────────────────────────────────
      autoRun() {
        if (this.model.canRun()) this.runAnalysis();
      },

      /**
       * Render the persisted slim fit (heavy arrays stripped) when the
       * worksheet data is unavailable for a refit. Scalar / diagnostic-summary
       * fields survive slimming, so the model/quality tables still render;
       * charts that need raw residual arrays simply stay empty — matching the
       * legacy slim-view behaviour.
       */
      showSlimResult() {
        const r = this.model.result;
        if (!r || !r.converged) return;
        this._fit = r;
        this._classCutoff = this.model.cutoff;
        this._classCache = r._classTable || null;
        this.result = this.buildResultView(r);
        this.$nextTick(() => this.renderActiveChart());
      },

      // ── Analysis (delegates statistics to the engine) ────────
      runAnalysis() {
        this._renderGen++;
        this.destroyCharts();
        this._errorKey = null;
        const sm = this.sm();
        if (!sm) return;

        if (this.model.colRefs.length === 0) { this.showError('errorNoX'); return; }
        if (!this.model.yKey) { this.showError('errorNoY'); return; }

        const fd = this.model.buildFitData(sm);
        const { y, xCols, xNames, xIsCat, yName, weights } = fd;
        if (y.length < 3) { this.showError('errorTooFew'); return; }

        const columns = xCols.map((vals, j) => ({ values: vals, name: xNames[j], categorical: xIsCat[j] }));
        const { X, terms } = buildGLMDesignMatrix(columns);
        this.fitAndDisplay(X, y, terms, yName, xNames, weights);
      },

      showError(key) {
        this._errorKey = key;
        this._errorText = _t(key);
        this.result = null;
        this._fit = null;
      },
      showErrorMsg(text) {
        this._errorKey = '_raw';
        this._errorText = text;
        this.result = null;
        this._fit = null;
      },

      fitAndDisplay(X, y, terms, yName, xNames, weights) {
        const fam = this.model.resolveFamily(y);
        const familyName = fam.familyName;
        const link = fam.link;
        this._detectKey = fam.auto ? fam.reasonKey : null;
        this._detectVisible = Boolean(fam.auto);

        if (familyName === 'binomial') {
          if (weights) {
            for (let i = 0; i < y.length; i++) {
              if (y[i] < 0 || y[i] > 1) { this.showError('errorProportionRange'); return; }
              if (weights[i] < 1 || !Number.isFinite(weights[i])) { this.showError('errorTrialsInvalid'); return; }
            }
          } else {
            const unique = new Set(y);
            if (unique.size > 2 || unique.size === 1) { this.showError('errorNotBinary'); return; }
            const levels = [...unique].sort((a, b) => a - b);
            const success = (this.model.successClass !== null && unique.has(this.model.successClass))
              ? this.model.successClass : levels[1];
            const failure = success === levels[0] ? levels[1] : levels[0];
            if (!(success === 1 && failure === 0)) {
              for (let i = 0; i < y.length; i++) y[i] = y[i] === success ? 1 : 0;
            }
            this._successInfo = { success, failure };
          }
        } else {
          this._successInfo = null;
        }

        const n = y.length;
        const p = X[0].length;
        if (n <= p) { this.showError('errorTooFewForP'); return; }

        let result, quasiActivated = false;
        try {
          result = fitGLM(X, y, { familyName, link, terms, confLevel: this.model.confLevel, weights: weights ?? undefined });
          if (result.converged && familyName === 'poisson') {
            const od = overdispersionCheck(result.pearsonResiduals, result.n, result.p);
            if (od.overdispersed) {
              result = fitGLM(X, y, { familyName, link, terms, confLevel: this.model.confLevel, estimateDispersion: true, weights: weights ?? undefined });
              quasiActivated = true;
            }
          }
        } catch (err) {
          this.showErrorMsg(`${_t('errorFit')}: ${err.message}`);
          return;
        }

        if (!result.converged) { this.showError('errorNoConverge'); return; }

        result._yName = yName;
        result._xNames = xNames;
        result._quasiActivated = quasiActivated;
        if (this._successInfo) result._successClassInfo = this._successInfo;

        const hat = hatValues(X, result.invXtWX, result.irlsWeights);
        result._hat = hat;
        result._cooks = cookDistance(result.pearsonResiduals, hat, p, result.dispersion);

        if (X[0].length > 2) result._vifs = computeGLMVIF(X, result.irlsWeights);

        if (familyName === 'binomial') {
          result._roc = computeROC(y, result.fittedValues);
          result._classTable = classificationTable(y, result.fittedValues, this.model.cutoff);
          result._hl = hosmerLemeshow(y, result.fittedValues);
        }
        if (familyName === 'poisson') {
          result._overdispersion = overdispersionCheck(result.pearsonResiduals, n, p);
        }

        this._errorKey = null;
        this._fit = result;
        this._classCutoff = this.model.cutoff;
        this._classCache = result._classTable || null;
        this.result = this.buildResultView(result);
        this.model.result = this.model.slimResult(result);
        this.predictResult = null;
        this.predictError = null;

        this.$nextTick(() => this.renderActiveChart());
      },

      // ── Result view-model (no HTML; pure data) ───────────────
      buildResultView(r) {
        const isBinomial = r.family.name === 'binomial';
        const isCount = r.family.name === 'poisson' || r.family.name === 'negbin';

        // Warnings
        const warnings = [];
        if (r.separationStrong) warnings.push(_t('warnSeparationStrong'));
        else if (r.separationDetected) warnings.push(_t('warnSeparation'));
        if (r.n / r.p < 10) warnings.push(_t('warnSmallN'));
        if (r.iterations >= 40) warnings.push(_t('warnSlowConverge'));
        if (r._overdispersion?.overdispersed) warnings.push(_t('warnOverdispersion'));
        if (r._quasiActivated) warnings.push(_t('warnQuasiActivated', { phi: r.dispersion.toFixed(2) }));
        if (r.thetaEstimated && r.thetaConverged === false) {
          warnings.push(_t('warnThetaUnstable', { theta: r.family?.theta?.toFixed?.(2) ?? EN_DASH }));
        }

        // Summary items (family / link / n / iters / theta / success-class)
        const summaryItems = [
          { label: _t('family'), value: _t(`family_${  r.family.name}`) },
          { label: _t('linkFunction'), value: r.family.link },
          { label: 'n', value: String(r.n) },
          { label: _t('iterations'), value: String(r.iterations) },
        ];
        if (r.family.theta != null) {
          summaryItems.push({ label: `${THETA} (dispersion)`, value: fmt(r.family.theta, 3) });
        }
        if (r._successClassInfo) {
          summaryItems.push({
            label: _t('successClass'),
            value: String(r._successClassInfo.success),
            swap: `${SWAP} ${String(r._successClassInfo.failure)}`,
          });
        }

        // KPI strip
        const mcfR2 = r.pseudoR2.mcfadden;
        const nagR2 = r.pseudoR2.nagelkerke;
        const mcfClass = mcfR2 >= 0.4 ? 'dmike-kpi--good' : mcfR2 >= 0.2 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
        const nagClass = nagR2 >= 0.8 ? 'dmike-kpi--good' : nagR2 >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
        const kpis = [
          { value: fmt(mcfR2, 4), label: 'McFadden R²', mod: mcfClass },
          { value: fmt(nagR2, 4), label: 'Nagelkerke R²', mod: nagClass },
          { value: fmt(r.aic, 2), label: 'AIC', mod: '' },
          { value: fmt(r.bic, 2), label: 'BIC', mod: '' },
        ];
        if (isBinomial && r._roc) {
          const aucClass = r._roc.auc >= 0.8 ? 'dmike-kpi--good' : r._roc.auc >= 0.6 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
          kpis.push({ value: fmt(r._roc.auc, 4), label: 'AUC', mod: aucClass });
        }

        // Quality items
        const qualityItems = [
          { label: _t('deviance'), value: fmt(r.deviance, 4) },
          { label: _t('nullDeviance'), value: fmt(r.nullDeviance, 4) },
          { label: _t('logLikelihood'), value: fmt(r.logLikelihood, 4) },
          { label: 'Cox-Snell R²', value: fmt(r.pseudoR2.coxSnell, 4) },
        ];
        if (isBinomial && r._hl) {
          qualityItems.push({ label: _t('hosmerLemeshow'), value: `${CHI2} = ${fmt(r._hl.statistic, 3)}, p = ${fmtP(r._hl.pValue)}` });
        }
        if (r._overdispersion) {
          qualityItems.push({ label: _t('overdispersionRatio'), value: fmt(r._overdispersion.ratio, 3) });
        }

        // Coefficient table
        const ratioHeader = isBinomial ? 'OR' : (isCount ? 'RR' : '');
        const coefRows = [];
        for (let j = 0; j < r.terms.length; j++) {
          const sc = sigClass(r.pValues[j]);
          let ratio = '';
          if (isBinomial && r.oddsRatios) {
            ratio = j === 0 ? EN_DASH : `${fmt(r.oddsRatios[j].or, 4)} [${fmt(r.oddsRatios[j].lower, 4)}, ${fmt(r.oddsRatios[j].upper, 4)}]`;
          } else if (isCount && r.rateRatios) {
            ratio = j === 0 ? EN_DASH : `${fmt(r.rateRatios[j].rr, 4)} [${fmt(r.rateRatios[j].lower, 4)}, ${fmt(r.rateRatios[j].upper, 4)}]`;
          }
          coefRows.push({
            term: r.terms[j],
            coef: `${fmt(r.coefficients[j])} [${fmt(r.ciLower[j])}, ${fmt(r.ciUpper[j])}]`,
            se: fmt(r.stdErrors[j]),
            z: fmt(r.zValues[j]),
            p: fmtP(r.pValues[j]),
            pClass: sc,
            ratio,
            stars: sigStars(r.pValues[j]),
          });
        }

        // VIF rows
        let vifRows = null;
        if (r._vifs && r._vifs.length > 0) {
          vifRows = r._vifs.map((vif, j) => ({
            term: r.terms[j + 1],
            vif: fmt(vif, 2),
            warn: vif > 10 ? WARN : vif > 5 ? '!' : '',
            warnClass: vif > 10 ? 'glm__sig--high' : vif > 5 ? 'glm__sig--low' : '',
          }));
        }

        // Overdispersion block
        let overdispersion = null;
        if (r._overdispersion) {
          const od = r._overdispersion;
          overdispersion = {
            items: [
              { label: `Pearson ${CHI2}`, value: fmt(od.pearsonChi2, 3) },
              { label: 'df', value: String(od.df) },
              { label: `${CHI2}/df`, value: fmt(od.ratio, 3) },
            ],
            hint: od.overdispersed ? _t('overdispersionHint') : null,
          };
        }

        return {
          isBinomial,
          warnings,
          summaryItems,
          kpis,
          qualityItems,
          ratioHeader,
          coefRows,
          equation: this.buildEquation(r),
          vifRows,
          overdispersion,
          aucText: (isBinomial && r._roc) ? fmt(r._roc.auc, 4) : null,
        };
      },

      buildEquation(r) {
        const isBinomial = r.family.name === 'binomial';
        const lhs = isBinomial ? 'logit(p)' : 'log(μ)';
        let eq = `${lhs} = ${fmt(r.coefficients[0], 4)}`;
        for (let j = 1; j < r.terms.length; j++) {
          const c = r.coefficients[j];
          const term = r.terms[j];
          const rendered = term.includes('·') ? `(${term})` : term;
          eq += ` ${c >= 0 ? '+' : '−'} ${fmt(Math.abs(c), 4)}·${rendered}`;
        }
        return eq;
      },

      // ── Prediction ───────────────────────────────────────────
      runPrediction() {
        const r = this._fit;
        if (!r) return;
        const row = [1];
        for (let j = 1; j < r.terms.length; j++) {
          const input = module._container.querySelector(`[data-ref="pred-x-${j}"]`);
          const v = parseFloat(input?.value);
          if (!isFinite(v)) { this.predictResult = null; this.predictError = _t('errorInvalidInput'); return; }
          row.push(v);
        }
        const pred = predictGLM(r, [row]);
        const isBinomial = r.family.name === 'binomial';
        const responseLabel = isBinomial ? _t('probability') : _t('expectedCount');
        const confPct = (r.confLevel * 100).toFixed(0);
        this.predictError = null;
        this.predictResult = {
          linear: fmt(pred.linear[0], 6),
          respLabel: responseLabel,
          response: fmt(pred.response[0], 6),
          ciLabel: `CI ${confPct}%:`,
          ci: pred.ciValid ? `[${fmt(pred.ciLower[0], 6)}, ${fmt(pred.ciUpper[0], 6)}]` : EN_DASH,
          ciHint: pred.ciValid ? null : _t('predictCiUnavailable'),
        };
      },

      // ── Save as model (models-store WRITE — cross-module) ────
      saveAsModel() {
        const r = this._fit;
        if (!r || !r.converged) return;
        const sm = this.sm();
        const fd = this.model.buildFitData(sm);
        const { y, xCols, xNames, xIsCat, yName } = fd;
        if (y.length === 0) { module._context.notify(_t('errorTooFew'), 'error'); return; }

        const factorSpec = xNames.map((name, j) => {
          if (xIsCat[j]) {
            const levels = [...new Set(xCols[j])].sort();
            return { name, kind: 'categorical', levels, reference: levels[0] };
          }
          let lo = Infinity, hi = -Infinity;
          for (const v of xCols[j]) { if (v < lo) lo = v; if (v > hi) hi = v; }
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
            return { name, kind: 'continuous', low: -1, high: 1 };
          }
          return { name, kind: 'continuous', low: lo, high: hi };
        });

        const specPredictors = factorSpec.map(f => f.kind === 'categorical'
          ? { id: f.name, kind: 'categorical', levels: f.levels, reference: f.reference }
          : { id: f.name, kind: 'continuous' });

        const columns = xCols.map((vals, j) => ({ values: vals, name: xNames[j], categorical: xIsCat[j] }));
        const { X } = buildGLMDesignMatrix(columns);

        const dataSnapshot = buildDataSnapshot({
          X, y, factorSpec, termSet: [...r.terms], experimentId: null, responseColumn: this.model.yKey,
        });

        const family = {
          name: r.family.name,
          link: r.family.link,
          ...(r.family.theta != null ? { theta: r.family.theta } : {}),
        };

        const record = {
          id: this.model.savedModelId ?? undefined,
          name: this.model.savedModelName || `${yName} — ${_t(`family_${  r.family.name}`)}`,
          experimentId: null,
          responseSpec: { sourceColumn: this.model.yKey, transform: 'identity', aggregateOver: null },
          family,
          terms: [...r.terms],
          termSet: [...r.terms],
          coef: [...r.coefficients],
          vcov: null,
          sigma2: null,
          df: r.n - r.p,
          rSqAdj: r.pseudoR2?.nagelkerke ?? 0,
          lofPValue: null,
          factorSpec,
          spec: { predictors: specPredictors, terms: [] },
          dataSnapshot,
          dataHash: computeDataHash(X, y),
          createdFromInstanceId: module._context.instanceId,
        };

        const id = saveModel(module._context.stateManager, record);
        this.model.savedModelId = id;
        this.model.savedModelName = record.name;
        module._context.notify(_t('modelSaved'), 'success');
      },

      // ── Imperative widgets: ColumnPicker + charts ────────────
      initPicker() {
        const wrap = module._container.querySelector('[data-ref="picker-cols"]');
        if (!wrap) return;
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'multi',
          types: ['numeric', 'currency', 'percent', 'text'],
          minCount: 1,
          onChange: (refs) => {
            this.model.colRefs = refs.map(r => ({ ...r }));
            if (this.model.yKey && refs.some(r => refToKey(r) === this.model.yKey)) {
              this.model.yKey = null;
            }
            this.autoRun();
          },
        });
        if (this.model.colRefs.length > 0) this._picker.value = this.model.colRefs;
      },

      destroyCharts() {
        for (const ch of this._charts) {
          if (ch && typeof ch.destroy === 'function') { try { ch.destroy(); } catch { /* ignore */ } }
        }
        this._charts = [];
      },

      _whenAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._renderGen) { resolve(null); return; }
            const el = module._container?.querySelector(selector);
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      async renderActiveChart() {
        this.destroyCharts();
        const r = this._fit;
        if (!r || !r.converged) return;
        const gen = this._renderGen;
        switch (this.model.activeTab) {
          case 'diagnostics':
            await this.renderResidualsVsFitted(r, gen);
            await this.renderQQPlot(r, gen);
            await this.renderCooksPlot(r, gen);
            break;
          case 'roc':
            await this.renderROCChart(r, gen);
            break;
          default: break;
        }
      },

      async _mkScatter(selector, gen, config, key) {
        const el = await this._whenAnchor(selector, gen);
        if (!el) return;
        el.replaceChildren();
        this.chartErrors[key] = '';
        let chart;
        try { chart = await module._context.chartManager.create(el, 'scatter', config); }
        catch (err) {
          // Declarative error — rendered via x-if/x-text in a sibling div.
          this.chartErrors[key] = `${_t('chartError')  }: ${  String(err.message || err)}`;
          return;
        }
        if (gen !== this._renderGen) { try { chart.destroy(); } catch { /* ignore */ } return; }
        this._charts.push(chart);
      },

      async renderResidualsVsFitted(r, gen) {
        await this._mkScatter('[data-ref="chart-residuals"]', gen, {
          title: _t('residualsVsFitted'),
          xLabel: _t('fittedValues'),
          yLabel: _t('devianceResiduals'),
          series: [{
            x: r.fittedValues, y: r.devianceResiduals, name: _t('devianceResiduals'),
            color: 'var(--color-chart-1)', markerSize: 5, strokeWidth: 0.75, symbol: 'circle',
          }],
          refLines: [{ dir: 'h', value: 0, dash: 'dash', color: 'var(--color-text-secondary)', width: 1 }],
        }, 'residuals');
      },

      async renderQQPlot(r, gen) {
        const sorted = [...r.devianceResiduals].sort((a, b) => a - b);
        const theoretical = normalOrderStats(sorted.length);
        const lo = Math.min(theoretical[0], sorted[0]);
        const hi = Math.max(theoretical[theoretical.length - 1], sorted[sorted.length - 1]);
        await this._mkScatter('[data-ref="chart-qq"]', gen, {
          title: _t('qqTitle'),
          xLabel: _t('theoreticalQuantiles'),
          yLabel: _t('devianceResiduals'),
          series: [
            { x: theoretical, y: sorted, name: _t('devianceResiduals'), color: 'var(--color-chart-1)', markerSize: 5, strokeWidth: 0.75, symbol: 'circle' },
            { x: [lo, hi], y: [lo, hi], name: 'Reference', color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-error)', foreground: true } },
          ],
        }, 'qq');
      },

      async renderCooksPlot(r, gen) {
        if (!r._cooks) return;
        const indices = r._cooks.map((_, i) => i + 1);
        const threshold = 4 / r.n;
        await this._mkScatter('[data-ref="chart-cooks"]', gen, {
          title: _t('cooksTitle'),
          xLabel: _t('observationNr'),
          yLabel: _t('cooksDistance'),
          yMin: 0,
          series: [{
            x: indices, y: r._cooks, name: _t('cooksDistance'),
            color: 'var(--color-chart-2)', markerSize: 4, strokeWidth: 0.75, symbol: 'circle',
          }],
          refLines: [{ dir: 'h', value: threshold, dash: 'dash', color: 'var(--color-warning)', width: 1.5, label: `4/n = ${threshold.toFixed(4)}` }],
        }, 'cooks');
      },

      async renderROCChart(r, gen) {
        if (r.family.name !== 'binomial') return;
        const roc = computeROC(r.y, r.fittedValues);
        await this._mkScatter('[data-ref="chart-roc"]', gen, {
          title: `${_t('rocCurve')} (AUC = ${roc.auc.toFixed(4)})`,
          xLabel: _t('falsePositiveRate'),
          yLabel: _t('truePositiveRate'),
          xMin: 0, xMax: 1, yMin: 0, yMax: 1,
          series: [
            { x: roc.fpr, y: roc.tpr, name: 'ROC', color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-chart-1)', foreground: true } },
            { x: [0, 1], y: [0, 1], name: _t('randomClassifier'), color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-text-secondary)' } },
          ],
        }, 'roc');
      },

      // ── Lifecycle ────────────────────────────────────────────
      init() {
        const ctx = module._context;

        // Resolve confidence / alpha defaults from app settings on a fresh model.
        const globalConf = (ctx.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
        if (this.model.confLevel == null) this.model.confLevel = globalConf;
        if (this.model.alpha == null) this.model.alpha = Number((1 - globalConf).toFixed(4));

        this._classCutoff = this.model.cutoff;

        this.$nextTick(() => {
          this.initPicker();

          // Restore a persisted slim fit: refit to repopulate residuals / hat /
          // cook arrays so the diagnostic charts have data when the tab opens.
          if (this.model.result && this.model.result._slim) {
            if (this.model.canRun()) {
              try { this.runAnalysis(); } catch { this.showSlimResult(); }
            } else {
              // Worksheet data gone — show the slim summary as legacy did
              // (scalar fields survive slimming; charts simply stay empty).
              this.showSlimResult();
            }
          } else if (this.model.canRun()) {
            this.autoRun();
          }
        });

        const eb = ctx.eventBus;
        const onAct = ({ instanceId }) => {
          if (instanceId === ctx.instanceId && this._picker) this._picker.refresh();
        };
        eb.on('module:activated', onAct);
        this._unsubs.push(() => eb.off('module:activated', onAct));

        // Only refit when a change touches our predictors / response / trials.
        const isOurColumn = (payload) => {
          if (!payload) return true;
          const refs = [...this.model.colRefs];
          if (this.model.yKey) refs.push(keyToRef(this.model.yKey));
          if (this.model.trialsKey) refs.push(keyToRef(this.model.trialsKey));
          return refs.some(r =>
            r && r.instanceId === payload.instanceId &&
            (!payload.sheetId || r.sheetId === payload.sheetId) &&
            (!payload.columnId || r.columnId === payload.columnId));
        };
        const onDataChange = (payload) => {
          if (isPickerFocused(module._container)) return;
          if (isOurColumn(payload)) this.autoRun();
        };
        eb.on('state:saved', onDataChange);
        eb.on('worksheet:dataChanged', onDataChange);
        this._unsubs.push(
          () => eb.off('state:saved', onDataChange),
          () => eb.off('worksheet:dataChanged', onDataChange),
        );

        const onTheme = () => { if (this._fit) { this._renderGen++; this.destroyCharts(); this.$nextTick(() => this.renderActiveChart()); } };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));
      },

      destroy() {
        for (const u of this._unsubs) u();
        this._unsubs = [];
        this._renderGen++;
        this.destroyCharts();
        if (this._picker) { try { this._picker.destroy(); } catch { /* ignore */ } this._picker = null; }
      },
    };
  },
});

/**
 * Custom loadExample: GLM examples ship a worksheet snapshot
 * (`sourceWorksheetData`, resolved from `sourceWorksheetFile` by the registry)
 * plus colRefs/yKey/trialsKey using the `__source__` placeholder instanceId.
 * We provision the worksheet (replacing any prior example-provisioned one),
 * rewrite the placeholder refs to the new instance, then apply via setState —
 * which rebuilds the Alpine tree; the init() then refits.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      data.colRefs = (data.colRefs || []).map(r =>
        (r && r.instanceId === '__source__') ? { ...r, instanceId } : r);
      if (typeof data.yKey === 'string' && data.yKey.startsWith('__source__|')) {
        data.yKey = data.yKey.replace('__source__', instanceId);
      }
      if (typeof data.trialsKey === 'string' && data.trialsKey.startsWith('__source__|')) {
        data.trialsKey = data.trialsKey.replace('__source__', instanceId);
      }
      // Drop any persisted derived result — the fresh worksheet refits.
      delete data.result;
      return data;
    },
  });
};

export default mod;
