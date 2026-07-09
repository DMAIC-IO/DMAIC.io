/**
 * D.Mike — GLM Regression Model (glm-regression-model.js)
 *
 * Holds the persistent configuration (selected predictor columns, response /
 * trials column keys, family method, confidence, cutoff, active tab, the
 * example-worksheet id, the saved models-store record id/name) plus the slim
 * persisted fit result. Adds thin orchestration helpers that read the live
 * worksheet via a stateManager and shape the (X, y) inputs — ALL GLM
 * statistics stay in `engines/glm-engine.js` (autoDetect, buildGLMDesignMatrix,
 * fitGLM, …). No DOM, no i18n, no CSS, no view flags.
 *
 * The full fit result is derived transiently in the view; only a slim copy
 * (heavy arrays stripped) is persisted under `result`, exactly as the legacy
 * `getState()` did, so the persistence shape stays byte-for-byte compatible.
 */

import { autoDetect } from '../../engines/glm-engine.js';
import { resolveColumnRef, getColumnRawValues, coerceNumeric } from '../../core/worksheet-columns.js';

const METHODS = ['auto', 'binomial', 'poisson', 'negbin'];
const TABS = ['model', 'diagnostics', 'roc', 'prediction'];

/** Split a pipe-delimited key `instanceId|sheetId|columnId` into a ref. */
function keyToRef(key) {
  if (!key) return null;
  const [instanceId, sheetId, columnId] = key.split('|');
  return { instanceId, sheetId, columnId };
}

export class State {
  /** @type {Array<{instanceId:string, sheetId:string, columnId:string}>} */
  colRefs = [];
  /** @type {string|null} */
  yKey = null;
  /** Optional trials column for grouped binomial (y read as proportion). */
  trialsKey = null;
  /** Which y level maps to success (1) for binary binomial fits, or null. */
  successClass = null;
  /** @type {'auto'|'binomial'|'poisson'|'negbin'} */
  method = 'auto';
  /** Confidence level (decimal). null on a fresh model → resolved in init(). */
  confLevel = null;
  /** Alpha risk (decimal). null on a fresh model → resolved in init(). */
  alpha = null;
  /** ROC classification cutoff. */
  cutoff = 0.5;
  /** @type {'model'|'diagnostics'|'roc'|'prediction'} */
  activeTab = 'model';
  /** Worksheet provisioned by loadExample (removed/recreated each load). */
  exampleWorksheetId = null;
  /** Id of the project-wide models-store record this instance wrote. */
  savedModelId = null;
  /** Name of that record (re-used on subsequent saves). */
  savedModelName = null;
  /** Slim persisted fit result (heavy arrays stripped). */
  result = null;

  // ── Gates ─────────────────────────────────────────────────────

  /** True when any input is set — drives the loadExample confirm gate. */
  hasContent() {
    return (this.colRefs?.length > 0) || Boolean(this.yKey) || Boolean(this.trialsKey);
  }

  /** True when there is at least one predictor and a response column. */
  canRun() {
    return this.colRefs.length > 0 && Boolean(this.yKey);
  }

  // ── Persistence ───────────────────────────────────────────────

  toJSON() {
    return {
      // Deep-copy every nested object/array so the persisted snapshot never
      // shares references with the (reactive Alpine proxy) live model —
      // structuredClone-safe.
      colRefs: this.colRefs.map(r => ({ ...r })),
      yKey: this.yKey,
      trialsKey: this.trialsKey,
      successClass: this.successClass,
      method: this.method,
      confLevel: this.confLevel,
      alpha: this.alpha,
      cutoff: this.cutoff,
      activeTab: this.activeTab,
      exampleWorksheetId: this.exampleWorksheetId,
      savedModelId: this.savedModelId,
      savedModelName: this.savedModelName,
      result: this.result ? JSON.parse(JSON.stringify(this.result)) : null,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;

    if (Array.isArray(d.colRefs)) {
      s.colRefs = d.colRefs.filter(Boolean).map(r => ({ ...r }));
    }
    s.yKey = typeof d.yKey === 'string' ? d.yKey : null;
    s.trialsKey = typeof d.trialsKey === 'string' ? d.trialsKey : null;
    s.successClass = (typeof d.successClass === 'number') ? d.successClass : null;
    s.method = METHODS.includes(d.method) ? d.method : 'auto';
    s.confLevel = (typeof d.confLevel === 'number' && d.confLevel > 0 && d.confLevel < 1)
      ? d.confLevel : null;
    s.alpha = (typeof d.alpha === 'number' && d.alpha > 0 && d.alpha < 1)
      ? d.alpha : null;
    s.cutoff = (typeof d.cutoff === 'number' && d.cutoff >= 0 && d.cutoff <= 1)
      ? d.cutoff : 0.5;
    s.activeTab = TABS.includes(d.activeTab) ? d.activeTab : 'model';
    s.exampleWorksheetId = (typeof d.exampleWorksheetId === 'string')
      ? d.exampleWorksheetId : null;
    s.savedModelId = (typeof d.savedModelId === 'string') ? d.savedModelId : null;
    s.savedModelName = (typeof d.savedModelName === 'string') ? d.savedModelName : null;
    s.result = (d.result && typeof d.result === 'object')
      ? JSON.parse(JSON.stringify(d.result)) : null;
    return s;
  }

  /**
   * Strip the heavy fields from a fit result before persisting. Removing the
   * raw design matrix, IRLS weights, residual / hat / cook arrays and
   * (X'WX)⁻¹ saves ~80 % of the localStorage / IDB footprint. Diagnostic
   * charts need these arrays — the view refits on init when slim state is
   * detected to repopulate them.
   */
  slimResult(r) {
    if (!r) return null;
    const slim = { ...r, _slim: true };
    delete slim.X;
    delete slim.y;
    delete slim.invXtWX;
    delete slim.XtWX;
    delete slim.irlsWeights;
    delete slim.fittedValues;
    delete slim.linearPredictor;
    delete slim.devianceResiduals;
    delete slim.pearsonResiduals;
    delete slim._hat;
    delete slim._cooks;
    return slim;
  }

  // ── Worksheet column reads (take a stateManager) ──────────────

  resolveColumn(sm, ref) {
    return resolveColumnRef(sm, ref);
  }

  getRawValues(sm, ref) {
    return getColumnRawValues(sm, ref);
  }

  toNumeric(val) {
    return coerceNumeric(val);
  }

  getNumericValues(sm, ref) {
    return this.getRawValues(sm, ref).map(v => this.toNumeric(v));
  }

  columnDisplayName(sm, ref) {
    if (!ref) return '?';
    const col = this.resolveColumn(sm, ref);
    return col ? (col.name || col.shortName || '?') : '?';
  }

  isCategorical(sm, ref) {
    const col = this.resolveColumn(sm, ref);
    return col?.type === 'text';
  }

  /**
   * Read the response / predictor / trials columns from the worksheet and
   * filter rows: drop a row when y is non-numeric, any predictor is missing
   * (empty/null for categorical, unparseable for numeric), or — when a trials
   * column is present — the weight is <= 0. Returns aligned arrays ready for
   * `buildGLMDesignMatrix` (which stays in the engine).
   *
   * @param {object} sm — stateManager
   * @returns {{
   *   y: number[], xCols: any[][], xNames: string[], xIsCat: boolean[],
   *   yName: string, weights: number[]|null
   * }}
   */
  buildFitData(sm) {
    const yRef = keyToRef(this.yKey);
    const yRaw = this.getRawValues(sm, yRef);
    const yName = this.columnDisplayName(sm, yRef);

    const xNames = [];
    const xRawCols = [];
    const xIsCat = [];
    for (const ref of this.colRefs) {
      const cat = this.isCategorical(sm, ref);
      xNames.push(this.columnDisplayName(sm, ref));
      xIsCat.push(cat);
      xRawCols.push(cat ? this.getRawValues(sm, ref) : this.getNumericValues(sm, ref));
    }

    const trialsRef = this.trialsKey ? keyToRef(this.trialsKey) : null;
    const trialsRaw = trialsRef ? this.getNumericValues(sm, trialsRef) : null;

    const maxLen = Math.min(
      yRaw.length,
      ...xRawCols.map(c => c.length),
      ...(trialsRaw ? [trialsRaw.length] : []),
    );
    const y = [];
    const xCols = xRawCols.map(() => []);
    const weights = trialsRaw ? [] : null;

    for (let i = 0; i < maxLen; i++) {
      const yv = this.toNumeric(yRaw[i]);
      if (yv === null) continue;
      let allOk = true;
      for (let j = 0; j < xRawCols.length; j++) {
        const v = xRawCols[j][i];
        if (xIsCat[j] ? (v == null || v === '') : v === null) { allOk = false; break; }
      }
      if (!allOk) continue;
      if (trialsRaw) {
        const w = trialsRaw[i];
        if (w === null || w <= 0) continue;
        weights.push(w);
      }
      y.push(yv);
      for (let j = 0; j < xRawCols.length; j++) xCols[j].push(xRawCols[j][i]);
    }

    return { y, xCols, xNames, xIsCat, yName, weights };
  }

  /**
   * Resolve the GLM family + link for a response vector. For the explicit
   * methods this is a fixed mapping; for 'auto' it delegates to the engine's
   * `autoDetect` and exposes the reason key for the detect-info box.
   *
   * @param {number[]} y
   * @returns {{familyName:string, link:string, auto:boolean, reasonKey?:string,
   *           requiresWeights?:boolean}}
   */
  resolveFamily(y) {
    if (this.method === 'auto') {
      const d = autoDetect(y);
      return {
        familyName: d.familyName,
        link: d.link,
        auto: true,
        reasonKey: d.reasonKey,
        requiresWeights: d.requiresWeights,
      };
    }
    return {
      familyName: this.method,
      link: this.method === 'binomial' ? 'logit' : 'log',
      auto: false,
    };
  }
}

export { keyToRef };
