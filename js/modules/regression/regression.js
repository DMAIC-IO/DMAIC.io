/**
 * D.Mike — Regression Analysis Module (regression.js)
 *
 * Improve phase: fits regression models and provides prediction. Migrated to
 * createModule + Alpine CSP. The Model (regression-model.js) holds the
 * persistent configuration + function-stripped fit result(s) + worksheet reads
 * + analysis orchestration. ALL regression statistics stay in
 * `engines/regression-engine.js` — nothing is reimplemented here. View
 * transforms (formatting, i18n, CSS classes, ANOVA/coef/predict view-models)
 * live in the data-Fn; the table/KPI markup is declarative in regression.html.
 * The only imperative widgets are the ColumnPicker and the chartManager charts
 * (sanctioned chart tier) plus the SS-pie composite (POM asserts its markup).
 *
 * Cross-module: `saveAsModel()` writes the fitted polynomial to the
 * project-central models-store (`saveModel`) with the exact legacy record shape
 * so the response-optimization module can reference it.
 *
 * Supports:
 *   - Polynomial (degree 1–3) with all X in one combined model + interactions
 *   - Exponential, Logarithmic, Power (single-X per predictor)
 */

import { createModule } from '../../core/template-module.js';
import { State, keyToRef, refToKey } from './regression-model.js';
import {
  regressionCurvePoints, confidenceBand, predictionBand, normalQuantile,
  predictMulti, predictValue, compileModelSpec,
} from '../../engines/regression-engine.js';
import {
  ColumnPicker, discoverColumns, isPickerFocused,
} from '../../ui/column-picker.js';
import { provisionWorksheet as _provisionWorksheet, removeProvisionedWorksheet as _removeProvisionedWorksheet } from '../../core/examples-registry.js';
import { saveModel, buildDataSnapshot, computeDataHash } from '../../core/models-store.js';
import { getChartColors } from '../../core/chart/chart-core.js';

// ── Glyphs carried over from the legacy innerHTML (kept out of x-text literals
// — Alpine CSP would emit \u-escapes verbatim). ───────────────────────
const EN_DASH = '–';       // –
const Y_HAT = 'Ŷ';         // Ŷ

/** @param {number} v @param {number} d */
function fmt(v, d = 4) {
  if (v == null || !isFinite(v)) return EN_DASH;
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d);
  return v.toFixed(d);
}
function fmtP(p) { return p < 0.0001 ? '< 0.0001' : p.toFixed(4); }

const mod = createModule({
  config: {
    id: 'regression',
    engine: 'alpine',
    phase: 'improve',
    allowedPhases: ['measure', 'analyze', 'improve', 'control'],
    icon: 'trending-up',
    version: '2.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (never persisted) ───────────────
      /** Full result view-model (KPIs/tabs/equation/flags) or null. */
      result: null,
      /** Error message text (plain, may be multi-line). */
      _errorText: '',
      /** Predict inputs view-model (stable objects for x-model). */
      _predictForm: [],
      /** Predict output. */
      _predictText: '',
      _predictInterval: '',
      /** Cached degree availability { n, options }. */
      _degree: { n: 0, options: [{ deg: 1, terms: 2, disabled: false }, { deg: 2, terms: 0, disabled: false }, { deg: 3, terms: 0, disabled: false }] },
      _picker: null,
      _charts: [],
      _unsubs: [],
      _renderGen: 0,
      /** SS-pie per-item visibility (transient). */
      _ssPieState: null,
      /** SS-pie legend rows (reactive — drives the declarative <template x-for>). */
      ssPieItems: [],
      /** SS-pie transient render context (chart instances + rebuild closures). */
      _ssPie: null,

      sm() { return module._context?.stateManager; },

      // ── Number / i18n display helpers ────────────────────────
      confDisplay() {
        const c = this.model.confLevel;
        return c == null ? '' : String(Number((c * 100).toFixed(2)));
      },
      alphaDisplay() {
        const a = this.model.alpha;
        return a == null ? '' : String(Number((a * 100).toFixed(2)));
      },
      errorText() { return this._errorText; },

      // ── DoE import options ───────────────────────────────────
      importOptions() {
        const sm = this.sm();
        return sm ? this.model.listExperimentImports(sm) : [];
      },

      // ── Column option lists (Y dropdown; not x-model-bound) ──
      yOptions() {
        const sm = this.sm();
        if (!sm) return [];
        const selected = new Set(this.model.colRefs.map(r => refToKey(r)));
        const all = discoverColumns(sm, { types: ['numeric', 'currency', 'percent', 'date', 'time'], minCount: 1 });
        const out = [];
        for (const col of all) {
          const key = refToKey({ instanceId: col.instanceId, sheetId: col.sheetId, columnId: col.columnId });
          if (selected.has(key)) continue;
          out.push({ key, name: col.columnName || col.shortName || '?' });
        }
        return out;
      },

      // ── Selected-info hint ───────────────────────────────────
      selectedInfoText() {
        const xCount = this.model.colRefs.length;
        if (xCount === 0) return _t('selectColumns');
        if (!this.model.yKey) return _t('selectYHint');
        if (xCount === 1) return _t('singleMode');
        return _t('multiMode', { n: xCount });
      },
      selectedInfoClass() {
        const xCount = this.model.colRefs.length;
        return (xCount === 0 || !this.model.yKey) ? 'reg__hint' : 'reg__info';
      },

      // ── Degree options ───────────────────────────────────────
      degreeDisabled(deg) {
        const o = this._degree.options.find(x => x.deg === deg);
        return Boolean(o && o.disabled);
      },
      degreeOptionTitle(deg) {
        const o = this._degree.options.find(x => x.deg === deg);
        if (!o || !o.disabled) return '';
        return _t('degreeDisabledHint', { deg, terms: o.terms, n: this._degree.n });
      },
      degreeHint() {
        const first = this._degree.options.find(o => o.disabled);
        if (!first) return '';
        return _t('degreeDisabledHint', { deg: first.deg, terms: first.terms, n: this._degree.n });
      },
      refreshDegree() {
        const sm = this.sm();
        if (sm) this._degree = this.model.degreeAvailability(sm);
      },

      // ── Algorithm Lab link ───────────────────────────────────
      algoNavigate(algoId) {
        if (algoId && module._context.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      },

      // ── X-selector (per-X single models) ─────────────────────
      xSelectorButtons() {
        if (!this.model.perXResults) return [];
        const keys = Object.keys(this.model.perXResults);
        if (keys.length <= 1) return [];
        return keys.map(key => ({
          key, label: this.model.perXResults[key]._nameX,
          active: key === this.model.activeXKey,
        }));
      },
      setActiveX(key) {
        this.model.activeXKey = key;
        this.rebuildResult();
        this.$nextTick(() => this.renderActiveChart());
      },

      // ── ANOVA view-model ─────────────────────────────────────
      anovaHeader: () => 'SS',
      anova() {
        const r = this.model.activeResult;
        if (!r) return { termRows: [] };
        const alpha = this.model.alpha;
        const regSig = r.fPVal < alpha;
        const out = {
          regRowClass: regSig ? 'reg__tr--sig' : 'reg__tr--not-sig',
          pSig: regSig ? 'reg__td--sig' : 'reg__td--not-sig',
          ssr: fmt(r.SSR), dfReg: r.dfReg, msr: fmt(r.MSR), fstat: fmt(r.Fstat), fp: fmtP(r.fPVal),
          sse: fmt(r.SSE), dfRes: r.dfRes, mse: fmt(r.MSE),
          sst: fmt(r.SST), dfTot: r.dfTot,
          termRows: [],
        };
        if (Array.isArray(r.blocks) && r.blocks.length > 0) {
          for (const b of r.blocks) {
            if (b.id === 'Intercept') continue;
            const sig = Number.isFinite(b.pValue) && b.pValue < alpha;
            out.termRows.push({
              id: `b-${  b.id}`, label: b.id,
              ss: fmt(b.ss), df: b.df, ms: fmt(b.ms), f: fmt(b.fStat),
              p: Number.isFinite(b.pValue) ? fmtP(b.pValue) : EN_DASH,
              pSig: sig ? 'reg__td--sig' : (Number.isFinite(b.pValue) ? 'reg__td--not-sig' : ''),
              trClass: sig ? 'reg__tr--sig' : (Number.isFinite(b.pValue) ? 'reg__tr--not-sig' : ''),
            });
          }
        } else {
          const coefs = (r.coefDetails || []).filter(c => c.term !== 'Intercept');
          for (const c of coefs) {
            if (c.t == null) continue;
            const ss = c.t ** 2 * r.MSE;
            const f = r.MSE > 0 ? ss / r.MSE : 0;
            const sig = c.pval != null && c.pval < alpha;
            out.termRows.push({
              id: `c-${  c.term}`, label: c.term,
              ss: fmt(ss), df: 1, ms: fmt(ss), f: fmt(f),
              p: c.pval != null ? fmtP(c.pval) : EN_DASH,
              pSig: sig ? 'reg__td--sig' : (c.pval != null ? 'reg__td--not-sig' : ''),
              trClass: sig ? 'reg__tr--sig' : (c.pval != null ? 'reg__tr--not-sig' : ''),
            });
          }
        }
        return out;
      },

      // ── Coefficient view-model ───────────────────────────────
      coefView() {
        const r = this.model.activeResult;
        if (!r) return { rows: [], canExclude: false, hasDetails: false, hasVIF: false };
        const alpha = this.model.alpha;
        const hasDetails = r.coefDetails[0]?.se != null;
        const hasVIF = Boolean(r.vif && r.vif.length > 0);
        const hasVIFFull = Boolean(r.vifFull && r.vifFull.length > 0);
        const canExclude = Boolean(r.allTerms);
        const excluded = new Set(r.excludeTerms || []);
        const hasBlocks = Array.isArray(r.blockMap) && r.blockMap.length > 0;
        const sortByP = this.model.coefSortByP;

        const vifMap = {}, vifFullMap = {};
        if (hasVIF && r.xNames) for (let i = 0; i < r.xNames.length; i++) vifMap[r.xNames[i]] = r.vif[i];
        if (hasVIFFull && r.xNames) for (let i = 0; i < r.xNames.length; i++) vifFullMap[r.xNames[i]] = r.vifFull[i];

        const detailCells = (c) => {
          const isSig = c?.pval != null && c.pval < alpha;
          const isNotSig = c?.pval != null && !isSig;
          return {
            se: fmt(c?.se), t: fmt(c?.t),
            p: c?.pval != null ? fmtP(c.pval) : EN_DASH,
            pSig: isSig ? 'reg__td--sig' : (isNotSig ? 'reg__td--not-sig' : ''),
            trClass: isNotSig ? 'reg__tr--not-sig' : (isSig ? 'reg__tr--sig' : ''),
          };
        };
        const vifCells = (label) => {
          const v = vifMap[label] ?? null;
          const vf = vifFullMap[label] ?? null;
          const vifClass = v != null && v > 10 ? 'reg__td--not-sig' : (v != null && v > 5 ? 'reg__td--vif-warn' : '');
          const vif = v != null ? fmt(v, 2) : EN_DASH;
          let vifFull = '';
          if (vf != null && v != null && Math.abs(vf - v) > 0.005) vifFull = `(${fmt(vf, 2)})`;
          return { vif, vifFull, vifClass };
        };
        const coefCell = (c) => {
          let ci = '';
          if (hasDetails && c?.ciLow != null && c?.ciHigh != null) ci = `[${fmt(c.ciLow)}, ${fmt(c.ciHigh)}]`;
          return { coef: fmt(c?.coeff), ci };
        };

        const mkRow = (label, c, opts = {}) => {
          const { isIntercept = false, blockTermId = null, indented = false, key } = opts;
          const dc = hasDetails ? detailCells(c) : {};
          const cc = coefCell(c);
          const vc = hasVIF ? vifCells(label) : {};
          return {
            key, label, dataTerm: blockTermId ?? label,
            checked: true, cbDisabled: Boolean(isIntercept || indented), noCheckbox: false,
            trClass: dc.trClass || '', termClass: indented ? 'reg__td--term-indent' : '',
            blockHeader: false,
            coef: cc.coef, ci: cc.ci,
            se: dc.se, t: dc.t, p: dc.p, pSig: dc.pSig,
            vif: vc.vif, vifFull: vc.vifFull, vifClass: vc.vifClass,
          };
        };
        const mkExcluded = (termId) => ({
          key: `ex-${  termId}`, label: termId, dataTerm: termId,
          checked: false, cbDisabled: false, noCheckbox: false,
          trClass: 'reg__tr--excluded', termClass: '', blockHeader: false,
          coef: '', ci: '', se: '', t: '', p: '', pSig: '', vif: '', vifFull: '', vifClass: '',
        });

        const rows = [];

        if (hasBlocks) {
          const coefsByBlock = new Map();
          coefsByBlock.set('Intercept', [r.coefDetails[0]]);
          for (const cd of r.coefDetails.slice(1)) {
            if (!coefsByBlock.has(cd.blockId)) coefsByBlock.set(cd.blockId, []);
            coefsByBlock.get(cd.blockId).push(cd);
          }
          const allTerms = r.allTerms || [];
          const activeGroups = [];
          const excludedGroups = [];
          const blockById = new Map(r.blockMap.map(b => [b.id, b]));
          const blockSummaryById = new Map((r.blocks || []).map(b => [b.id, b]));

          for (const termId of allTerms) {
            if (termId !== 'Intercept' && excluded.has(termId)) { excludedGroups.push({ termId }); continue; }
            const coefs = coefsByBlock.get(termId) || [];
            if (coefs.length === 0) continue;
            if (coefs.length === 1) activeGroups.push({ kind: 'single', termId, coef: coefs[0], isIntercept: termId === 'Intercept' });
            else activeGroups.push({ kind: 'block', termId, coefs, block: blockById.get(termId), summary: blockSummaryById.get(termId) });
          }

          if (sortByP && hasDetails) {
            const sortKey = (g) => {
              if (g.kind === 'single' && g.isIntercept) return -Infinity;
              if (g.kind === 'block') return g.summary?.pValue ?? -1;
              return g.coef?.pval ?? -1;
            };
            activeGroups.sort((a, b) => {
              if (a.kind === 'single' && a.isIntercept) return -1;
              if (b.kind === 'single' && b.isIntercept) return 1;
              return sortKey(b) - sortKey(a);
            });
          }

          for (const g of activeGroups) {
            if (g.kind === 'single') {
              rows.push(mkRow(g.termId, g.coef, { isIntercept: g.isIntercept, key: `s-${  g.termId}` }));
            } else {
              const s = g.summary;
              const sig = s && Number.isFinite(s.pValue) && s.pValue < alpha;
              rows.push({
                key: `bh-${  g.termId}`, label: g.termId, dataTerm: g.termId,
                checked: true, cbDisabled: false, noCheckbox: false,
                trClass: `reg__tr--block ${  sig ? 'reg__tr--sig' : (s && Number.isFinite(s.pValue) ? 'reg__tr--not-sig' : '')}`,
                termClass: 'reg__td--block-header', blockHeader: true,
                blockDf: `df=${  g.block?.df ?? g.coefs.length}`,
                coef: EN_DASH, ci: '',
                se: '', t: s ? fmt(s.fStat) : '',
                p: s && Number.isFinite(s.pValue) ? fmtP(s.pValue) : EN_DASH,
                pSig: sig ? 'reg__td--sig' : (s && Number.isFinite(s.pValue) ? 'reg__td--not-sig' : ''),
                vif: '', vifFull: '', vifClass: '',
              });
              for (const cd of g.coefs) {
                rows.push(mkRow(cd.columnName ?? cd.term, cd, { blockTermId: g.termId, indented: true, key: `sub-${  g.termId  }-${  cd.columnName ?? cd.term}` }));
              }
            }
          }
          for (const g of excludedGroups) rows.push(mkExcluded(g.termId));
        } else {
          const coefMap = new Map(r.coefDetails.map(c => [c.term, c]));
          const allTerms = r.allTerms || r.coefDetails.map(c => c.term);
          const list = allTerms.map(term => ({
            term, isExcluded: excluded.has(term), isIntercept: term === 'Intercept', coef: coefMap.get(term) || null,
          }));
          if (sortByP && hasDetails) {
            list.sort((a, b) => {
              if (a.isIntercept) return -1;
              if (b.isIntercept) return 1;
              if (a.isExcluded !== b.isExcluded) return a.isExcluded ? 1 : -1;
              return (b.coef?.pval ?? -1) - (a.coef?.pval ?? -1);
            });
          }
          for (const row of list) {
            if (row.isExcluded) rows.push(mkExcluded(row.term));
            else rows.push(mkRow(row.term, row.coef, { isIntercept: row.isIntercept, key: `l-${  row.term}` }));
          }
        }

        return { rows, canExclude, hasDetails, hasVIF };
      },

      // ── Build the full result view-model ─────────────────────
      buildResultView(r) {
        const r2class = r.R2 >= 0.8 ? 'dmike-kpi--good' : r.R2 >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
        const r2pVal = r.R2pred ?? null;
        const r2pClass = r2pVal != null ? (r2pVal >= 0.8 ? 'dmike-kpi--good' : r2pVal >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad') : '';
        const alpha = this.model.alpha;
        const pClass = r.fPVal < alpha ? 'dmike-kpi--good' : r.fPVal < alpha * 2 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';

        const kpis = [
          { label: 'R²', value: fmt(r.R2), mod: r2class, tip: _t('tipR2') },
          { label: _t('adjR2'), value: fmt(r.adjR2), mod: r2class, tip: _t('tipAdjR2') },
        ];
        if (r2pVal != null) kpis.push({ label: _t('predR2'), value: fmt(r2pVal), mod: r2pClass, tip: _t('tipPredR2') });
        kpis.push({ label: _t('stdError'), value: fmt(r.Se), mod: '', tip: _t('tipStdError') });
        kpis.push({ label: _t('fStat'), value: fmt(r.Fstat, 2), mod: '', tip: _t('tipFStat') });
        kpis.push({ label: _t('pValueF'), value: fmtP(r.fPVal), mod: pClass, tip: _t('tipPValueF') });
        kpis.push({ label: _t('durbinWatson'), value: fmt(r.dw, 3), mod: '', tip: _t('tipDurbinWatson') });

        const isMultiX = r.multiX && r.xCount > 1;
        const tabs = [
          { id: 'scatter', label: isMultiX ? _t('tabActualVsPredicted') : _t('tabRegression') },
          { id: 'residuals', label: _t('tabResiduals') },
          { id: 'order', label: _t('tabOrder') },
          { id: 'qq', label: _t('tabQQ') },
          { id: 'histogram', label: _t('tabHistogram') },
          { id: 'ss-pie', label: _t('tabSSPie') },
        ];
        if (isMultiX) {
          tabs.push({ id: 'main-effects', label: _t('tabMainEffects') });
          tabs.push({ id: 'interaction', label: _t('tabInteraction') });
        }

        return {
          equation: r.equation,
          kpis, tabs,
          canSaveModel: Boolean(r.multiX && this.model.isPolynomial),
        };
      },

      /** Rebuild transient result view + predict inputs from the active result. */
      rebuildResult() {
        const r = this.model.activeResult;
        if (!r) { this.result = null; this._predictForm = []; this._predictText = ''; this._predictInterval = ''; return; }
        this.result = this.buildResultView(r);
        this.buildPredictForm(r);
        // Reset stale active tab if the current tab is not available for this result.
        if (!this.result.tabs.some(tb => tb.id === this.model.activeTab)) {
          this.model.activeTab = 'scatter';
        }
        this._predictText = '';
        this._predictInterval = '';
      },

      // ── Predict inputs ───────────────────────────────────────
      buildPredictForm(r) {
        const form = [];
        if (r.multiX) {
          const predictors = r.spec?.predictors;
          if (predictors) {
            for (const p of predictors) {
              if (p.kind === 'categorical') {
                form.push({ id: p.id, label: p.id, kind: 'categorical', levels: p.levels || [], value: (p.levels && p.levels[0]) || '' });
              } else {
                form.push({ id: p.id, label: p.id, kind: 'numeric', value: '' });
              }
            }
          } else {
            (r._xNames || []).forEach((name, i) => form.push({ id: `idx-${  i}`, label: name, kind: 'numeric', value: '', _idx: i }));
          }
        } else {
          form.push({ id: 'single', label: _t('predictXValue'), kind: 'single', value: '' });
        }
        this._predictForm = form;
      },
      predictForm() { return this._predictForm; },
      predictText() { return this._predictText; },
      predictInterval() { return this._predictInterval; },

      onPredictInput() {
        const r = this.model.activeResult;
        if (!r) return;
        this._predictText = '';
        this._predictInterval = '';

        if (r.multiX) {
          if (r.spec) {
            const columns = {};
            const labelParts = [];
            for (const f of this._predictForm) {
              let v;
              if (f.kind === 'categorical') {
                v = f.value || (f.levels && f.levels[0]);
                if (!f.levels?.includes(v)) return;
              } else {
                v = parseFloat(f.value);
                if (!Number.isFinite(v)) return;
              }
              columns[f.id] = [v];
              labelParts.push(`${f.id}=${typeof v === 'number' ? fmt(v, 3) : v}`);
            }
            let row;
            try { row = compileModelSpec(r.spec, { columns }).X[0]; } catch { return; }
            const beta = r._coefficients ?? r.fit?.ols?.beta;
            if (!Array.isArray(beta) || beta.length !== row.length) return;
            let yHat = 0;
            for (let i = 0; i < row.length; i++) yHat += row[i] * beta[i];
            this._predictText = `${Y_HAT}(${labelParts.join(', ')}) = ${fmt(yHat)}`;
            return;
          }
          // Legacy multi-X (continuous-only, no spec).
          const xVals = [];
          for (const f of this._predictForm) {
            const v = parseFloat(f.value);
            if (isNaN(v)) return;
            xVals.push(v);
          }
          if (xVals.length !== r.xCount) return;
          const pred = predictMulti(r, xVals);
          const xStr = xVals.map((v, i) => `${r._xNames[i]}=${fmt(v, 3)}`).join(', ');
          this._predictText = `${Y_HAT}(${xStr}) = ${fmt(pred.yHat)}`;
          if (pred.piLow != null && pred.piHigh != null) {
            this._predictInterval = `${_t('predictionInterval', { level: (r.confLevel * 100).toFixed(0) })}: [${fmt(pred.piLow)}, ${fmt(pred.piHigh)}]`;
          }
        } else {
          const f = this._predictForm[0];
          const xVal = parseFloat(f?.value);
          if (isNaN(xVal)) return;
          const pred = predictValue(r, xVal);
          this._predictText = `${Y_HAT}(${fmt(xVal, 3)}) = ${fmt(pred.yHat)}`;
          if (pred.piLow != null && pred.piHigh != null) {
            this._predictInterval = `${_t('predictionInterval', { level: (r.confLevel * 100).toFixed(0) })}: [${fmt(pred.piLow)}, ${fmt(pred.piHigh)}]`;
          }
        }
      },

      // ── Event handlers ───────────────────────────────────────
      onImportChange(event) {
        const key = event.target.value;
        if (!key) return;
        const sm = this.sm();
        if (sm && this.model.applyExperimentImport(sm, key)) {
          if (this._picker) this._picker.value = this.model.colRefs;
          this.refreshDegree();
          this.autoRun();
        }
      },
      onYChange(event) {
        this.model.yKey = event.target.value || null;
        this.refreshDegree();
        this.autoRun();
      },
      onRegTypeChange() {
        // model.regType already updated via x-model.
        this.autoRun();
      },
      onDegreeChange() {
        // model.polyDegree already updated via x-model.number.
        this.autoRun();
      },
      onConfChange(event) {
        const v = parseFloat(String(event.target.value).replace(',', '.'));
        if (Number.isFinite(v) && v > 0 && v < 100) this.model.confLevel = v / 100;
        event.target.value = Number((this.model.confLevel * 100).toFixed(2));
        this.autoRun();
      },
      onAlphaChange(event) {
        const v = parseFloat(String(event.target.value).replace(',', '.'));
        if (Number.isFinite(v) && v > 0 && v < 100) this.model.alpha = v / 100;
        event.target.value = Number((this.model.alpha * 100).toFixed(2));
        this.autoRun();
      },
      toggleCI() { this.model.showCI = !this.model.showCI; this.autoRun(); },
      togglePI() { this.model.showPI = !this.model.showPI; this.autoRun(); },
      toggleSort() { this.model.coefSortByP = !this.model.coefSortByP; },
      toggleTerm(term, event) {
        if (event.target.checked) {
          this.model.excludedTerms = this.model.excludedTerms.filter(t => t !== term);
        } else {
          this.model.excludedTerms = [...this.model.excludedTerms, term];
        }
        this.runAnalysis();
      },

      // ── Auto-run gate ────────────────────────────────────────
      autoRun() {
        if (this.model.colRefs.length === 0 || !this.model.yKey) {
          if (this.model.result || this.model.perXResults) {
            this.model.clearResults();
            this.result = null;
            this._errorText = '';
            this._renderGen++;
            this.destroyCharts();
          }
          return;
        }
        this.runAnalysis();
      },

      runAnalysis() {
        const sm = this.sm();
        if (!sm) return;
        this._renderGen++;
        this.destroyCharts();
        this._errorText = '';

        const res = this.model.runAnalysis(sm);
        if (!res.ok) {
          if (res.errors && res.errors.length > 0) {
            this._errorText = res.errors.map(e => this.formatPerXError(e)).join('\n');
          } else if (res.errorKey) {
            this._errorText = _t(res.errorKey, res.errorParams || undefined);
          }
          this.result = null;
          return;
        }
        // Per-X path may carry partial errors alongside a result.
        if (res.errors && res.errors.length > 0) {
          this._errorText = res.errors.map(e => this.formatPerXError(e)).join('\n');
        }
        this.rebuildResult();
        this.$nextTick(() => this.renderActiveChart());
      },

      formatPerXError(e) {
        return `${e.name  }: ${  _t(e.key, e.params || undefined)}`;
      },

      // ── Save as model (models-store WRITE — cross-module) ────
      saveAsModel() {
        const r = this.model.result;
        if (!r || !r.multiX || !this.model.isPolynomial) return;
        const sm = this.sm();
        const m = this.model;

        const xCols = m.colRefs.map(ref => m.getRawNumericValues(sm, ref));
        const yRaw = m.getRawNumericValues(sm, keyToRef(m.yKey));
        const n = Math.min(yRaw.length, ...xCols.map(c => c.length));
        const X = [], y = [];
        const originalToFiltered = new Map();
        for (let i = 0; i < n; i++) {
          if (yRaw[i] == null) continue;
          const row = xCols.map(c => c[i]);
          if (row.some(v => v == null)) continue;
          originalToFiltered.set(i, y.length);
          X.push(row); y.push(yRaw[i]);
        }

        const xNames = m.colRefs.map(ref => m.columnDisplayName(sm, ref));
        const yName = m.columnDisplayName(sm, keyToRef(m.yKey));
        const factorSpec = xNames.map((name, j) => {
          let lo = Infinity, hi = -Infinity;
          for (const row of X) { const v = row[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return { name, low: -1, high: 1 };
          return { name, low: lo, high: hi };
        });

        const dataSnapshot = buildDataSnapshot({
          X, y, factorSpec,
          termSet: r._termNames ? [...r._termNames] : [],
          experimentId: m.activeImportSource?.experimentId ?? null,
          responseColumn: m.activeImportSource?.sourceColumn ?? m.yKey,
        });

        const lofPValue = m.computeLoFPValue(sm, r, y, originalToFiltered);
        const specSnapshot = r.spec ? JSON.parse(JSON.stringify(r.spec)) : null;

        const record = {
          id: m.savedModelId ?? undefined,
          name: m.savedModelName || `${yName} — Modell`,
          experimentId: m.activeImportSource?.experimentId ?? null,
          responseSpec: {
            sourceColumn: m.activeImportSource?.sourceColumn ?? m.yKey,
            transform: m.activeImportSource?.transform ?? 'identity',
            aggregateOver: null,
          },
          termSet: r._termNames ? [...r._termNames] : [],
          coef: r._coefficients ?? null,
          vcov: null,
          sigma2: r.Se != null ? r.Se * r.Se : null,
          df: r.df ?? null,
          rSqAdj: r.adjR2 ?? null,
          lofPValue,
          factorSpec,
          spec: specSnapshot,
          dataSnapshot,
          dataHash: computeDataHash(X, y),
          createdFromInstanceId: module._context.instanceId,
        };

        const id = saveModel(sm, record);
        m.savedModelId = id;
        m.savedModelName = record.name;
        module._context.notify(_t('modelSaved'), 'success');
      },

      // ── Imperative widgets: ColumnPicker ─────────────────────
      initPicker() {
        const wrap = module._container.querySelector('[data-ref="picker-cols"]');
        if (!wrap) return;
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'multi',
          types: ['numeric', 'currency', 'percent', 'date', 'time'],
          minCount: 1,
          onChange: (refs) => {
            this.model.colRefs = refs.map(r => ({ ...r }));
            if (this.model.yKey && refs.some(r => refToKey(r) === this.model.yKey)) this.model.yKey = null;
            this.refreshDegree();
            this.autoRun();
          },
        });
        if (this.model.colRefs.length > 0) this._picker.value = this.model.colRefs;
      },

      // ── Charts ───────────────────────────────────────────────
      destroyCharts() {
        for (const ch of this._charts) {
          if (ch && typeof ch.destroy === 'function') { try { ch.destroy(); } catch { /* ignore */ } }
        }
        this._charts = [];
        // Drop the stale SS-pie chart handles; the declarative legend keeps its
        // last items until the next renderSSPieChart re-populates them.
        this._ssPie = null;
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
        const r = this.model.activeResult;
        if (!r) return;
        const gen = this._renderGen;
        switch (this.model.activeTab) {
          case 'scatter': await this.renderScatterChart(r, gen); break;
          case 'residuals': await this.renderResidualChart(r, gen); break;
          case 'order': await this.renderOrderChart(r, gen); break;
          case 'qq': await this.renderQQChart(r, gen); break;
          case 'histogram': await this.renderHistogramChart(r, gen); break;
          case 'ss-pie': await this.renderSSPieChart(r, gen); break;
          case 'main-effects': await this.renderMainEffectsChart(r, gen); break;
          case 'interaction': await this.renderInteractionChart(r, gen); break;
        }
      },

      async _create(el, type, config, gen) {
        let chart;
        try { chart = await module._context.chartManager.create(el, type, config); }
        catch { return null; }
        if (gen !== this._renderGen) { try { chart.destroy(); } catch { /* ignore */ } return null; }
        this._charts.push(chart);
        return chart;
      },

      async renderScatterChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-scatter"]', gen);
        if (!plotEl) return;
        plotEl.replaceChildren();

        if (r.multiX && r.xCount > 1) {
          const nameY = r._nameY || 'Y';
          await this._create(plotEl, 'scatter', {
            title: _t('tabActualVsPredicted'),
            xLabel: `${nameY} (${_t('fittedValues')})`,
            yLabel: `${nameY} (${_t('dataPoints')})`,
            showLegend: true,
            series: [
              {
                name: '', color: 'rgba(0,0,0,0)', markerSize: 0,
                x: [Math.min(...r.yHat, ...r.ys), Math.max(...r.yHat, ...r.ys)],
                y: [Math.min(...r.yHat, ...r.ys), Math.max(...r.yHat, ...r.ys)],
                connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-chart-2)' },
                hideLegend: true,
              },
              {
                name: _t('dataPoints'), color: 'var(--color-chart-1)', markerSize: 4, strokeWidth: 0.75,
                x: r.yHat, y: r.ys, symbol: 'circle',
              },
            ],
          }, gen);
          return;
        }

        const nameX = r._nameX || (r._xNames ? r._xNames[0] : 'X');
        const nameY = r._nameY || 'Y';
        const xs = r.multiX ? r.xMatrix[0] : r.xs;
        const ys = r.ys;
        const series = [{
          name: _t('dataPoints'), color: 'var(--color-chart-1)', markerSize: 4, strokeWidth: 0.75,
          x: xs, y: ys, symbol: 'circle',
        }];

        const curvePts = regressionCurvePoints(r);
        if (curvePts.length > 0) {
          series.push({
            name: _t('regressionLine'), color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0,
            x: curvePts.map(p => p.x), y: curvePts.map(p => p.y),
            connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-error)', foreground: true },
          });
          if (this.model.showCI && r.multiX) {
            const upper = [], lower = [];
            for (const pt of curvePts) {
              const band = confidenceBand(r, pt.x);
              if (band) { upper.push({ x: pt.x, y: band.upper }); lower.push({ x: pt.x, y: band.lower }); }
            }
            if (upper.length > 0) {
              series.push({ name: `CI ${(r.confLevel * 100).toFixed(0)}%`, color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, x: upper.map(p => p.x), y: upper.map(p => p.y), connectLine: { show: true, dash: 'dash', width: 1.2, color: 'var(--color-chart-2)' } });
              series.push({ name: '', color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, x: lower.map(p => p.x), y: lower.map(p => p.y), connectLine: { show: true, dash: 'dash', width: 1.2, color: 'var(--color-chart-2)' }, hideLegend: true });
            }
          }
          if (this.model.showPI && r.multiX) {
            const upper = [], lower = [];
            for (const pt of curvePts) {
              const band = predictionBand(r, pt.x);
              if (band) { upper.push({ x: pt.x, y: band.upper }); lower.push({ x: pt.x, y: band.lower }); }
            }
            if (upper.length > 0) {
              series.push({ name: `PI ${(r.confLevel * 100).toFixed(0)}%`, color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, x: upper.map(p => p.x), y: upper.map(p => p.y), connectLine: { show: true, dash: 'dot', width: 1.2, color: 'var(--color-chart-4)' } });
              series.push({ name: '', color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, x: lower.map(p => p.x), y: lower.map(p => p.y), connectLine: { show: true, dash: 'dot', width: 1.2, color: 'var(--color-chart-4)' }, hideLegend: true });
            }
          }
        }

        await this._create(plotEl, 'scatter', {
          title: `${nameX} → ${nameY}`, xLabel: nameX, yLabel: nameY, showLegend: true, series,
        }, gen);
      },

      async renderResidualChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-residuals"]', gen);
        if (!plotEl) return;
        plotEl.replaceChildren();
        await this._create(plotEl, 'scatter', {
          title: _t('residualsVsFitted'), xLabel: _t('fittedValues'), yLabel: _t('residuals'), showLegend: false,
          refLines: [{ dir: 'h', value: 0, dash: 'dash', width: 1, color: 'var(--color-error)', label: '0' }],
          series: [{ name: _t('residuals'), color: 'var(--color-chart-3)', markerSize: 4, strokeWidth: 0.75, x: r.yHat, y: r.residuals, symbol: 'circle' }],
        }, gen);
      },

      async renderOrderChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-order"]', gen);
        if (!plotEl) return;
        plotEl.replaceChildren();
        const indices = r.residuals.map((_, i) => i + 1);
        await this._create(plotEl, 'scatter', {
          title: _t('residualsVsOrder'), xLabel: _t('observationNr'), yLabel: _t('residuals'), showLegend: false,
          refLines: [{ dir: 'h', value: 0, dash: 'dash', width: 1, color: 'var(--color-error)', label: '0' }],
          series: [{ name: _t('residuals'), color: 'var(--color-chart-4)', markerSize: 4, strokeWidth: 0.75, x: indices, y: r.residuals, symbol: 'circle', connectLine: { show: true, dash: 'solid', width: 1, color: 'var(--color-chart-4)' } }],
        }, gen);
      },

      async renderQQChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-qq"]', gen);
        if (!plotEl) return;
        plotEl.replaceChildren();
        const sorted = [...r.residuals].sort((a, b) => a - b);
        const n = sorted.length;
        const resMean = sorted.reduce((s, v) => s + v, 0) / n;
        const resStd = Math.sqrt(sorted.reduce((s, v) => s + (v - resMean) ** 2, 0) / (n - 1));
        const theoretical = sorted.map((_, i) => normalQuantile((i + 0.5) / n));
        const standardized = sorted.map(v => resStd > 0 ? (v - resMean) / resStd : 0);
        const lo = Math.min(Math.min(...theoretical), Math.min(...standardized));
        const hi = Math.max(Math.max(...theoretical), Math.max(...standardized));
        await this._create(plotEl, 'scatter', {
          title: _t('qqTitle'), xLabel: _t('theoreticalQuantiles'), yLabel: _t('standardizedResiduals'), showLegend: false,
          series: [
            { name: '', color: 'rgba(0,0,0,0)', markerSize: 0, x: [lo, hi], y: [lo, hi], connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-chart-2)' }, hideLegend: true },
            { name: _t('residuals'), color: 'var(--color-chart-5)', markerSize: 4, strokeWidth: 0.75, x: theoretical, y: standardized, symbol: 'circle' },
          ],
        }, gen);
      },

      async renderHistogramChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-histogram"]', gen);
        if (!plotEl) return;
        plotEl.replaceChildren();
        await this._create(plotEl, 'histogram', {
          title: _t('histTitle'), xLabel: _t('residuals'), yLabel: _t('frequency'), showLegend: false, showNormalCurve: true, data: r.residuals,
        }, gen);
      },

      async renderSSPieChart(r, gen) {
        const items = [];
        const coefs = r.coefDetails || [];
        for (let j = 0; j < coefs.length; j++) {
          const c = coefs[j];
          if (c.term === 'Intercept') continue;
          const ss = c.t != null ? c.t ** 2 * r.MSE : 0;
          items.push({ label: c.term, ss });
        }
        items.push({ label: _t('sourceResiduals'), ss: r.SSE });

        const colors = getChartColors();
        if (!this._ssPieState || this._ssPieState.length !== items.length) this._ssPieState = items.map(() => true);

        const fmtNum = (v) => v.toLocaleString(module._context.language === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: 2 });

        // Legend rows are rendered declaratively by the Alpine template
        // (regression.html → <template x-for="(item, i) in ssPieItems">).
        // Each row carries pre-formatted RAW text (x-text escapes structurally),
        // the swatch colour and the checkbox state.
        this.ssPieItems = items.map((it, i) => ({
          label: it.label,
          val: fmtNum(it.ss),
          color: colors[i % colors.length],
          checked: this._ssPieState[i],
        }));

        const buildSlices = () => items.map((it, i) => ({ name: it.label, value: it.ss, color: colors[i % colors.length] })).filter((_, i) => this._ssPieState[i]);
        const buildBarConfig = () => {
          const visible = items.map((it, i) => ({ it, color: colors[i % colors.length], visible: this._ssPieState[i] })).filter(v => v.visible).sort((a, b) => b.it.ss - a.it.ss);
          return {
            categories: visible.map(v => v.it.label),
            groups: [{ name: _t('ssLabel'), values: visible.map(v => v.it.ss), colors: visible.map(v => v.color) }],
            yLabel: _t('ssLabel'), showLegend: false, categoryGap: 0.35,
          };
        };

        // The pie + bar charts stay imperative chartManager mounts into the
        // templated [data-ref] hosts (sanctioned chart tier). The hosts live
        // inside the ss-pie tab's x-if block — resolve via the bounded rAF-poll.
        const chartEl = await this._whenAnchor('[data-ref="ss-pie-chart"]', gen);
        if (!chartEl) return;
        chartEl.replaceChildren();
        const barEl = module._container.querySelector('[data-ref="ss-pie-bars"]');
        if (!barEl) return;
        barEl.replaceChildren();

        const chart = await this._create(chartEl, 'pie', { slices: buildSlices(), showLegend: false, showTitle: false }, gen);
        const barChart = await this._create(barEl, 'bar', buildBarConfig(), gen);
        if (!chart || !barChart) return;

        // Stash the live chart instances + rebuild closures so the declarative
        // legend's @change handler (toggleSSPie) can re-plot.
        this._ssPie = { chart, barChart, buildSlices, buildBarConfig };
      },

      /**
       * SS-pie legend checkbox @change handler — toggles a term's visibility
       * and re-plots the pie + bar charts. Replaces the legacy post-render
       * addEventListener delegate.
       * @param {number} i legend item index
       * @param {Event} event
       */
      toggleSSPie(i, event) {
        const checked = event && event.target ? event.target.checked : !this._ssPieState[i];
        this._ssPieState[i] = checked;
        if (this.ssPieItems[i]) this.ssPieItems[i].checked = checked;
        if (!this._ssPie) return;
        module._context.chartManager.update(this._ssPie.chart, { slices: this._ssPie.buildSlices() });
        module._context.chartManager.update(this._ssPie.barChart, this._ssPie.buildBarConfig());
      },

      _getXMeans(r) { return r.xMatrix.map(col => col.reduce((s, v) => s + v, 0) / col.length); },
      _getActivePredictorIndices(r) {
        const excluded = new Set(r.excludeTerms || []);
        const xNames = r._xNames || [];
        const allTerms = r.allTerms || [];
        const active = [];
        for (let xi = 0; xi < xNames.length; xi++) {
          const name = xNames[xi];
          const hasActive = allTerms.some(term => term !== 'Intercept' && term.includes(name) && !excluded.has(term));
          if (hasActive) active.push(xi);
        }
        return active;
      },
      _getInteractionPredictorIndices(r) {
        const excluded = new Set(r.excludeTerms || []);
        const xNames = r._xNames || [];
        const allTerms = r.allTerms || [];
        const result = new Set();
        for (const term of allTerms) {
          if (term === 'Intercept' || excluded.has(term)) continue;
          if (!term.includes('·')) continue;
          for (let xi = 0; xi < xNames.length; xi++) if (term.includes(xNames[xi])) result.add(xi);
        }
        return result;
      },

      async renderMainEffectsChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-main-effects"]', gen);
        if (!plotEl || !r.multiX) return;
        plotEl.replaceChildren();
        const xMeans = this._getXMeans(r);
        const yMean = r.ys.reduce((s, v) => s + v, 0) / r.ys.length;
        const xNames = r._xNames || [];
        const STEPS = 50;
        const activeIndices = new Set(this._getActivePredictorIndices(r));
        const interactionIndices = this._getInteractionPredictorIndices(r);
        const grid = document.createElement('div');
        grid.className = 'reg__effects-grid';
        plotEl.appendChild(grid);
        for (let xi = 0; xi < r.xCount; xi++) {
          if (!activeIndices.has(xi)) continue;
          if (interactionIndices.has(xi)) continue;
          const col = r.xMatrix[xi];
          const xMin = Math.min(...col), xMax = Math.max(...col);
          const step = (xMax - xMin) / (STEPS - 1);
          const lineX = [], lineY = [];
          for (let s = 0; s < STEPS; s++) {
            const xVal = xMin + s * step;
            const xVals = [...xMeans]; xVals[xi] = xVal;
            const pred = predictMulti(r, xVals);
            lineX.push(xVal); lineY.push(pred.yHat);
          }
          const cell = document.createElement('div');
          cell.className = 'reg__effects-cell';
          grid.appendChild(cell);
          await this._create(cell, 'scatter', {
            title: xNames[xi] || `X${xi + 1}`, xLabel: xNames[xi] || `X${xi + 1}`, yLabel: _t('meanResponse'),
            titleSize: 13, labelSize: 11, tickSize: 10, showLegend: false,
            refLines: [{ dir: 'h', value: yMean, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)', label: '' }],
            series: [{ name: xNames[xi], color: 'var(--color-chart-1)', markerSize: 0, x: lineX, y: lineY, connectLine: { show: true, dash: 'solid', width: 2.5, color: 'var(--color-chart-1)' } }],
          }, gen);
        }
      },

      async renderInteractionChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-interaction"]', gen);
        if (!plotEl || !r.multiX || r.xCount < 2) return;
        plotEl.replaceChildren();
        const xMeans = this._getXMeans(r);
        const xNames = r._xNames || [];
        const STEPS = 50;
        const levelColors = ['var(--color-chart-1)', 'var(--color-chart-3)', 'var(--color-error)'];
        const activeIndices = new Set(this._getActivePredictorIndices(r));
        const grid = document.createElement('div');
        grid.className = 'reg__effects-grid';
        plotEl.appendChild(grid);
        for (let i = 0; i < r.xCount; i++) {
          if (!activeIndices.has(i)) continue;
          for (let j = 0; j < r.xCount; j++) {
            if (i === j) continue;
            if (!activeIndices.has(j)) continue;
            const colI = r.xMatrix[i], colJ = r.xMatrix[j];
            const xiMin = Math.min(...colI), xiMax = Math.max(...colI);
            const xjMin = Math.min(...colJ), xjMean = xMeans[j], xjMax = Math.max(...colJ);
            const step = (xiMax - xiMin) / (STEPS - 1);
            const levels = [
              { val: xjMin, label: `${xNames[j]} ${_t('levelLow')}` },
              { val: xjMean, label: `${xNames[j]} ${_t('levelMid')}` },
              { val: xjMax, label: `${xNames[j]} ${_t('levelHigh')}` },
            ];
            const series = levels.map((lev, li) => {
              const lineX = [], lineY = [];
              for (let s = 0; s < STEPS; s++) {
                const xVal = xiMin + s * step;
                const xVals = [...xMeans]; xVals[i] = xVal; xVals[j] = lev.val;
                const pred = predictMulti(r, xVals);
                lineX.push(xVal); lineY.push(pred.yHat);
              }
              return { name: lev.label, color: levelColors[li], markerSize: 0, x: lineX, y: lineY, connectLine: { show: true, dash: 'solid', width: 2, color: levelColors[li] } };
            });
            const cell = document.createElement('div');
            cell.className = 'reg__effects-cell';
            grid.appendChild(cell);
            await this._create(cell, 'scatter', {
              title: `${xNames[i]} × ${xNames[j]}`, xLabel: xNames[i], yLabel: _t('meanResponse'),
              titleSize: 13, labelSize: 11, tickSize: 10, showLegend: true, series,
            }, gen);
          }
        }
      },

      // ── Lifecycle ────────────────────────────────────────────
      init() {
        const ctx = module._context;
        const globalConf = (ctx.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
        if (this.model.confLevel == null) this.model.confLevel = globalConf;
        if (this.model.alpha == null) this.model.alpha = Number((1 - globalConf).toFixed(4));

        this.$nextTick(() => {
          this.initPicker();
          this.refreshDegree();
          if (this.model.activeResult) {
            this.rebuildResult();
            this.$nextTick(() => this.renderActiveChart());
          }
        });

        const eb = ctx.eventBus;
        const onAct = ({ instanceId }) => {
          if (instanceId === ctx.instanceId && this._picker) this._picker.refresh();
        };
        eb.on('module:activated', onAct);
        this._unsubs.push(() => eb.off('module:activated', onAct));

        const onDataChange = () => {
          if (isPickerFocused(module._container)) return;
          this.refreshDegree();
          this.autoRun();
        };
        eb.on('state:saved', onDataChange);
        eb.on('worksheet:dataChanged', onDataChange);
        this._unsubs.push(
          () => eb.off('state:saved', onDataChange),
          () => eb.off('worksheet:dataChanged', onDataChange),
        );

        const onTheme = () => {
          if (this.model.activeResult) { this._renderGen++; this.destroyCharts(); this.$nextTick(() => this.renderActiveChart()); }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

      },

      /**
       * Generic route hook — called by createModule whenever this instance is
       * the routed one and the route sub-path changes.
       *
       * Adopts the sub-path head as the active tab when it names a real,
       * currently-available tab. Empty sub ⇒ keep the persisted activeTab.
       *
       * @param {string[]} sub  Route sub-path array from the route store.
       */
      onRouteChanged(sub) {
        const key = Array.isArray(sub) && sub.length > 0 ? sub[0] : null;
        if (!key || key === this.model.activeTab) return;
        // Guard against navigating to a tab the current result doesn't expose.
        if (this.result?.tabs && !this.result.tabs.some(tb => tb.id === key)) return;
        this._renderGen++;
        this.destroyCharts();
        this.model.activeTab = key;
        this.$nextTick(() => this.renderActiveChart());
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
 * Custom loadExample: regression examples ship a worksheet snapshot
 * (`sourceWorksheetData`) plus colRefs/yKey using the `__source__` placeholder
 * instanceId. We provision the worksheet (replacing any prior example-provisioned
 * one), rewrite the placeholder refs to the new instance, then apply via
 * setState — which rebuilds the Alpine tree; init() then re-runs the analysis.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const t = (k) => ctx.i18n.t(k);

  const curJson = this.getState();
  const cur = curJson ? State.fromJSON(curJson) : null;
  const hasContent = cur ? cur.hasContent() : false;
  if (hasContent && ctx?.confirmPopout) {
    const ok = await ctx.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
    if (!ok) return;
  }

  const data = { ...payload.data };
  // Carry forward the example-worksheet id so we can remove the old sheet.
  const prevExampleWs = cur?.exampleWorksheetId ?? null;

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;
    if (prevExampleWs) _removeProvisionedWorksheet(ctx, prevExampleWs);
    const ref = _provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      data.colRefs = (data.colRefs || []).map(r =>
        r?.instanceId === '__source__' ? { ...r, instanceId: ref.instanceId } : r);
      if (typeof data.yKey === 'string' && data.yKey.startsWith('__source__|')) {
        data.yKey = data.yKey.replace('__source__', ref.instanceId);
      }
    }
  }
  // Drop any persisted derived result — the fresh worksheet refits.
  delete data.result;
  delete data.perXResults;

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

export default mod;
