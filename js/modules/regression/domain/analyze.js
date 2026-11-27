/**
 * D.Mike — Regression: die Rechnung (domain/analyze.js). Rein.
 *
 * Wie die Altform (`runPolynomial`, `runSingleXModels`): beim Polynom alle X
 * in einem Modell über `fitFromSpec`, sonst je X ein Einzelmodell über
 * `runRegression`. Die Statistik bleibt in `engines/regression-engine.js`.
 * Fehler sind Gründe (i18n-Schlüssel mit Parametern), keine Texte. `analyze`
 * merkt sich je Model die letzte Eingabe, damit alle Ableitungen und die
 * Ansicht die Engine einmal je Änderung rufen. Das volle Ergebnis (mit den
 * Vorhersagefunktionen der Engine) bleibt im Merker und geht nie ins Model.
 */
import {
  runRegression, computeVIF, generatePolynomialTerms, fitFromSpec,
  compileModelSpec, estimableTerms, predictMulti, predictValue,
} from '../../../engines/regression-engine.js';
import { tInv } from '../../../engines/math-utils.js';
import { parseDecimalInput } from '../../../core/parse-decimal.js';
import { readCol, descriptorOf, numericOf, pairedOf, refKey } from './columns.js';

/** @typedef {import('../../../core/source-reader.js').Source} Source */
/** @typedef {import('./columns.js').ColumnRef} ColumnRef */
/** @typedef {import('./columns.js').Column} Column */

/** Die Regressionstypen (gleich dem Literal im Schema). */
export const REG_TYPES = Object.freeze(/** @type {const} */ (['polynomial', 'exponential', 'logarithmic', 'power']));
/** Die Polynomgrade (gleich dem Literal im Schema). */
export const DEGREES = Object.freeze(/** @type {const} */ ([1, 2, 3]));

/**
 * Der Eingabestand der Rechnung.
 * @typedef {object} Inputs
 * @property {readonly ColumnRef[]} colRefs
 * @property {ColumnRef|null} yRef
 * @property {string} regType
 * @property {number} polyDegree
 * @property {number} confLevel
 * @property {readonly string[]} excludedTerms
 * @property {string|null} [activeXKey]
 */

/**
 * Ein Grund ohne (volles) Ergebnis.
 * @typedef {object} Failure
 * @property {string} reason  i18n-Schlüssel (`errMinData`, `errInsufficientDf`, `errAliasedTerms`, `errGeneric`, `errColumnMissing`, `perX`)
 * @property {Record<string, any>|null} params  Parameter des Texts
 * @property {Array<{ name: string, reason: string, params: Record<string, any>|null }>} perX  Gründe je X bei Einzelmodellen
 */

/**
 * Die Rechnung zum Stand.
 * @typedef {object} Analysis
 * @property {'none'|'poly'|'single'} kind
 * @property {any} poly  volles Polynomergebnis (Altform `result`) oder `null`
 * @property {Record<string, any>|null} perX  volle Einzelmodelle je Spaltenschlüssel
 * @property {Failure|null} error
 * @property {Array<{ term: string, with: string[] }>} aliased  vermengte Terme eines gescheiterten Fits
 */

/** @type {Analysis} */
const NONE = Object.freeze({ kind: 'none', poly: null, perX: null, error: null, aliased: [] });

/** Merker je Model. @type {WeakMap<object, { key: string, value: Analysis }>} */
const memos = new WeakMap();

/** Zahl der Engine-Läufe (für Tests des Merkers). */
let runs = 0;
/** @returns {number} */
export function engineRuns() { return runs; }

/**
 * Terme eines Polynoms mit k Prädiktoren und Grad d (wie
 * `buildPolyDesignMatrix` der Engine).
 * @param {number} k @param {number} degree
 * @returns {number}
 */
export function polyTermCount(k, degree) {
  let p = 1 + k;
  if (degree >= 2) p += k + k * (k - 1) / 2;
  if (degree >= 3) p += k + k * (k - 1) + k * (k - 1) * (k - 2) / 6;
  return p;
}

/**
 * Die Spalten des Stands; `null`, wenn ein Bezug nicht lesbar ist.
 * @param {Inputs} m @param {Source} src
 * @returns {{ xs: Column[], y: Column }|null}
 */
export function readInputs(m, src) {
  /** @type {Column[]} */
  const xs = [];
  for (const r of m.colRefs) {
    const c = readCol(src, r);
    if (!c) return null;
    xs.push(c);
  }
  const y = readCol(src, m.yRef);
  return y ? { xs, y } : null;
}

/**
 * Die Daten eines Polynoms: Zeilen, in denen Y und alle X einen gültigen
 * Wert haben (kategoriale X: eine bekannte Stufe).
 * @param {Column[]} xCols @param {Column} yCol
 * @returns {{ predictors: any[], data: { columns: Record<string, any[]>, y: number[] },
 *   xDescs: import('./columns.js').Descriptor[], xFilteredRaw: any[][], yFiltered: number[] }}
 */
export function polyData(xCols, yCol) {
  const yRaw = numericOf(yCol);
  const xDescs = xCols.map(descriptorOf);
  const maxLen = Math.min(yRaw.length, ...xDescs.map((d) => d.values.length));
  /** @type {number[]} */ const yFiltered = [];
  /** @type {any[][]} */ const xFilteredRaw = xDescs.map(() => []);
  for (let i = 0; i < maxLen; i++) {
    const yv = yRaw[i];
    if (yv == null || !Number.isFinite(yv)) continue;
    let allOk = true;
    for (const d of xDescs) {
      const v = d.values[i];
      if (d.kind === 'continuous') {
        if (v == null || !Number.isFinite(/** @type {number} */ (v))) { allOk = false; break; }
      } else if (v == null || !d.levels.includes(/** @type {string} */ (v))) { allOk = false; break; }
    }
    if (!allOk) continue;
    yFiltered.push(yv);
    for (let j = 0; j < xDescs.length; j++) xFilteredRaw[j].push(xDescs[j].values[i]);
  }
  const predictors = xDescs.map((d) => (d.kind === 'categorical'
    ? { id: d.name, kind: 'categorical', levels: d.levels, reference: d.reference }
    : { id: d.name, kind: 'continuous' }));
  const data = { columns: Object.fromEntries(predictors.map((p, j) => [p.id, xFilteredRaw[j]])), y: yFiltered };
  return { predictors, data, xDescs, xFilteredRaw, yFiltered };
}

/**
 * @param {string} reason @param {Record<string, any>|null} [params]
 * @returns {Analysis}
 */
const fail = (reason, params = null) => ({ ...NONE, error: { reason, params, perX: [] } });

/**
 * Der Grund `errAliasedTerms` eines rangdefizienten Polynoms.
 * @param {any} spec @param {any} data
 * @returns {Analysis}
 */
function aliasedTermsError(spec, data) {
  const compiled = compileModelSpec(spec, data);
  const blocks = compiled.blockMap.map((/** @type {any} */ b) => ({
    id: b.id, columns: b.columnIndices.map((/** @type {number} */ ci) => compiled.X.map((/** @type {number[]} */ row) => row[ci])),
  }));
  const { aliased } = estimableTerms(blocks, data.y.length);
  if (aliased.length === 0) return fail('errInsufficientDf');
  const list = aliased.map((/** @type {any} */ a) => ({ term: a.id, with: [...a.with] }));
  return { ...fail('errAliasedTerms', { term: list[0].term, with: list[0].with.join(', ') }), aliased: list };
}

/**
 * Das Polynom über alle X (Altform `runPolynomial` und
 * `adaptFitToLegacyResult`).
 * @param {Inputs} m @param {Column[]} xCols @param {Column} yCol
 * @returns {Analysis}
 */
function polynomial(m, xCols, yCol) {
  const { predictors, data, xDescs, xFilteredRaw, yFiltered } = polyData(xCols, yCol);
  const xNames = xDescs.map((d) => d.name);
  const yName = yCol.name;
  if (yFiltered.length < 3) return fail('errMinData', { n: yFiltered.length });

  const allTerms = generatePolynomialTerms(predictors, /** @type {1|2|3} */ (m.polyDegree));
  const excludedSet = new Set(m.excludedTerms);
  const activeTerms = allTerms.filter((/** @type {any} */ term) => !excludedSet.has(term.id));
  const spec = { predictors, terms: activeTerms };

  // n ≤ Spalten lässt keinen Restfreiheitsgrad; die Engine klemmte df_error
  // auf 1 und meldete einen Scheinfit.
  let columnCount = activeTerms.length + 1;
  try { columnCount = compileModelSpec(spec, data).X[0]?.length ?? columnCount; } catch { /* der Fit meldet es */ }
  if (yFiltered.length <= columnCount) return fail('errInsufficientDf');

  let fit;
  try {
    fit = fitFromSpec(spec, data, { confLevel: m.confLevel });
  } catch (e) {
    const msg = String(/** @type {any} */ (e)?.message || e);
    if (yFiltered.length <= activeTerms.length + 1) return fail('errInsufficientDf');
    if (/singular|rank-deficient/i.test(msg)) return aliasedTermsError(spec, data);
    return fail('errGeneric');
  }

  // VIF nur über die stetigen Prädiktoren.
  const continuous = xDescs.map((d, i) => (d.kind === 'continuous' ? i : -1)).filter((i) => i >= 0);
  /** @type {Array<number|null>|null} */ let vifFull = null;
  /** @type {Array<number|null>|null} */ let vif = null;
  if (continuous.length >= 2) {
    const fullVifs = computeVIF(continuous.map((i) => xFilteredRaw[i]));
    vifFull = xDescs.map(() => null);
    continuous.forEach((orig, k) => { /** @type {any[]} */ (vifFull)[orig] = fullVifs[k]; });
    /** @type {number[]} */ const activeX = [];
    for (let xi = 0; xi < predictors.length; xi++) {
      if (predictors[xi].kind !== 'continuous') continue;
      const name = predictors[xi].id;
      if (activeTerms.some((/** @type {any} */ term) => term.factors.some((/** @type {any} */ f) => f.id === name))) activeX.push(xi);
    }
    if (activeX.length >= 2) {
      const reduced = computeVIF(activeX.map((i) => xFilteredRaw[i]));
      vif = xDescs.map(() => null);
      activeX.forEach((orig, k) => { /** @type {any[]} */ (vif)[orig] = reduced[k]; });
    } else {
      vif = xDescs.map((_, i) => (activeX.includes(i) ? 1 : null));
    }
  }

  const ols = fit.ols;
  const tCrit = ols.dfError > 0 ? tInv((1 + m.confLevel) / 2, ols.dfError) : 0;
  const coefDetails = [{
    term: 'Intercept', coeff: ols.beta[0], se: ols.seBeta[0], t: ols.tValues[0], pval: ols.pValues[0],
    ciLow: ols.beta[0] - tCrit * ols.seBeta[0], ciHigh: ols.beta[0] + tCrit * ols.seBeta[0],
  }];
  for (const cd of fit.coefDetails) {
    coefDetails.push({
      term: cd.columnName, coeff: cd.coeff, se: cd.se, t: cd.t, pval: cd.pval,
      ciLow: cd.ciLow, ciHigh: cd.ciHigh, blockId: cd.blockId,
    });
  }
  const hasCategorical = predictors.some((p) => p.kind === 'categorical');
  const predict = hasCategorical
    ? null
    : (/** @type {number[]} */ xVals) => {
      /** @type {Record<string, number>} */ const obj = {};
      predictors.forEach((p, i) => { obj[p.id] = xVals[i]; });
      return fit.predict(obj);
    };
  const poly = {
    spec, blockMap: fit.blockMap, blocks: fit.blocks, fit, hasCategorical,
    type: 'polynomial', degree: m.polyDegree, multiX: true,
    xCount: predictors.length, xNames, _xNames: [...xNames], _nameY: yName,
    _termNames: ['Intercept', ...spec.terms.map((/** @type {any} */ t) => t.id)],
    _coefficients: ols.beta, confLevel: m.confLevel,
    R2: fit.diagnostics.R2, adjR2: fit.diagnostics.adjR2, R2pred: fit.diagnostics.R2pred,
    PRESS: fit.diagnostics.PRESS, Se: fit.diagnostics.sigma, Fstat: fit.diagnostics.fStat,
    fPVal: fit.diagnostics.fPValue, dw: fit.diagnostics.dw,
    SST: ols.SST, SSR: ols.SSR, SSE: ols.SSE,
    dfReg: ols.dfModel, dfRes: ols.dfError, dfTot: ols.dfModel + ols.dfError,
    MSR: ols.dfModel > 0 ? ols.SSR / ols.dfModel : 0, MSE: ols.MSE, df: ols.dfError,
    yHat: ols.predicted, residuals: ols.residuals, invXtX: ols.XtXinv,
    n: yFiltered.length, p: ols.beta.length, ys: [...yFiltered],
    xMatrix: xFilteredRaw.map((c) => [...c]),
    coefDetails,
    allTerms: ['Intercept', ...allTerms.map((/** @type {any} */ t) => t.id)],
    excludeTerms: [...m.excludedTerms],
    vif, vifFull,
    reg: {
      coeffs: [...ols.beta], terms: ['Intercept', ...fit.coefDetails.map((/** @type {any} */ c) => c.columnName)],
      p: ols.beta.length, type: 'polynomial', predict,
    },
    equation: fit.equation,
  };
  return { ...NONE, kind: 'poly', poly };
}

/**
 * Einzelmodelle je X (Altform `runSingleXModels`); Gründe je X auch neben
 * einem Ergebnis.
 * @param {Inputs} m @param {Column[]} xCols @param {Column} yCol
 * @returns {Analysis}
 */
function singleX(m, xCols, yCol) {
  /** @type {Record<string, any>} */
  const results = {};
  /** @type {Failure['perX']} */
  const errors = [];
  xCols.forEach((xCol, i) => {
    const name = xCol.name;
    const paired = pairedOf(xCol, yCol);
    if (!paired || paired.x.length < 3) {
      errors.push({ name, reason: 'errMinData', params: { n: paired ? paired.x.length : 0 } });
      return;
    }
    try {
      const result = runRegression(paired.x, paired.y, m.regType, m.confLevel);
      result._nameX = name;
      result._nameY = yCol.name;
      results[refKey(m.colRefs[i])] = result;
    } catch (e) {
      const msg = /** @type {any} */ (e)?.message;
      if (msg === 'MIN_DATA') errors.push({ name, reason: 'errMinData', params: { n: paired.x.length } });
      else if (msg === 'INSUFFICIENT_DF') errors.push({ name, reason: 'errInsufficientDf', params: null });
      else errors.push({ name, reason: 'errGeneric', params: null });
    }
  });
  const error = errors.length > 0 ? { reason: 'perX', params: null, perX: errors } : null;
  if (Object.keys(results).length === 0) return { ...NONE, error };
  return { ...NONE, kind: 'single', perX: results, error };
}

/**
 * Die Rechnung zum Stand. Ohne X oder Y nichts (kein Grund); ist ein Bezug
 * nicht lesbar (Spalte gelöscht), der Grund `errColumnMissing` ohne Rechnung.
 * @param {Inputs} m Stand des Models
 * @param {Source} src Leser des Arbeitsblatts
 * @returns {Analysis}
 */
export function analyze(m, src) {
  if (!Array.isArray(m.colRefs) || m.colRefs.length === 0 || !m.yRef) return NONE;
  const cols = readInputs(m, src);
  if (!cols) return fail('errColumnMissing');
  const key = JSON.stringify([m.regType, m.polyDegree, m.confLevel, m.excludedTerms, m.colRefs, cols]);
  const memo = memos.get(m);
  if (memo && memo.key === key) return memo.value;
  runs++;
  const value = m.regType === 'polynomial' ? polynomial(m, cols.xs, cols.y) : singleX(m, cols.xs, cols.y);
  memos.set(m, { key, value });
  return value;
}

/**
 * Schlüssel des gezeigten Einzelmodells: der gespeicherte, wenn es ihn gibt,
 * sonst der erste (Altform).
 * @param {Analysis} a @param {string|null|undefined} stored
 * @returns {string|null}
 */
export function activeXOf(a, stored) {
  if (a.kind !== 'single' || !a.perX) return null;
  const keys = Object.keys(a.perX);
  return stored && keys.includes(stored) ? stored : (keys[0] ?? null);
}

/**
 * Das gezeigte Ergebnis (Polynom oder gewähltes Einzelmodell); `null` ohne.
 * @param {Analysis} a @param {string|null|undefined} stored
 * @returns {any}
 */
export function activeResultOf(a, stored) {
  if (a.kind === 'poly') return a.poly;
  const k = activeXOf(a, stored);
  return k && a.perX ? a.perX[k] : null;
}

/**
 * Die ANOVA-Zerlegung eines Ergebnisses als Rohzahlen.
 * @param {any} r
 * @returns {{ regression: any, terms: any[], error: any, total: any }|null}
 */
export function anovaOf(r) {
  if (!r || typeof r.SSR !== 'number') return null;
  /** @type {any[]} */
  const terms = [];
  if (Array.isArray(r.blocks) && r.blocks.length > 0) {
    for (const b of r.blocks) {
      if (b.id === 'Intercept') continue;
      terms.push({ term: b.id, ss: b.ss, df: b.df, ms: b.ms, f: b.fStat, p: b.pValue });
    }
  } else {
    for (const c of (r.coefDetails || [])) {
      if (c.term === 'Intercept' || c.t == null) continue;
      const ss = c.t ** 2 * r.MSE;
      terms.push({ term: c.term, ss, df: 1, ms: ss, f: r.MSE > 0 ? ss / r.MSE : 0, p: c.pval });
    }
  }
  return {
    regression: { ss: r.SSR, df: r.dfReg, ms: r.MSR, f: r.Fstat, p: r.fPVal },
    terms,
    error: { ss: r.SSE, df: r.dfRes, ms: r.MSE },
    total: { ss: r.SST, df: r.dfTot },
  };
}

/**
 * Eine endliche Zahl oder `null`.
 * @param {unknown} v @returns {number|null}
 */
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Das Ergebnis als Zahlen für die Lesefläche (Altform `_agentResult`).
 * @param {any} r @param {string} regType
 * @returns {import('./model.js').Result|null}
 */
export function agentResult(r, regType) {
  if (!r) return null;
  /** @type {Record<string, number|null>} */
  const vifByName = {};
  if (Array.isArray(r.vif) && Array.isArray(r.xNames)) {
    r.xNames.forEach((/** @type {string} */ name, /** @type {number} */ i) => { vifByName[name] = r.vif[i] ?? null; });
  }
  const a = anovaOf(r);
  const finRow = (/** @type {any} */ o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? fin(v) : v]));
  return {
    type: /** @type {any} */ (r.multiX || regType === 'polynomial' ? 'polynomial' : regType),
    equation: r.equation ?? null,
    n: fin(r.n), R2: fin(r.R2), adjR2: fin(r.adjR2), R2pred: fin(r.R2pred), Se: fin(r.Se),
    Fstat: fin(r.Fstat), fPVal: fin(r.fPVal), dw: fin(r.dw),
    coefficients: (r.coefDetails ?? []).map((/** @type {any} */ c) => {
      const term = c.columnName ?? c.term;
      return {
        term, coeff: fin(c.coeff), se: fin(c.se), t: fin(c.t), pval: fin(c.pval),
        ciLow: fin(c.ciLow), ciHigh: fin(c.ciHigh), vif: vifByName[term] ?? null,
      };
    }),
    excludedTerms: [...(r.excludeTerms ?? [])],
    anova: a ? /** @type {any} */ ({ regression: finRow(a.regression), terms: a.terms.map(finRow), error: finRow(a.error), total: finRow(a.total) }) : null,
  };
}

/**
 * Ein Prädiktor der Vorhersage.
 * @typedef {{ id: string, label: string, kind: 'numeric'|'categorical'|'single', levels?: string[] }} Predictor
 */

/**
 * Die Eingaben einer Vorhersage für ein Ergebnis.
 * @param {any} r
 * @returns {Predictor[]}
 */
export function predictorsOf(r) {
  if (!r) return [];
  if (!r.multiX) return [{ id: 'single', label: r._nameX ?? 'X', kind: 'single' }];
  const predictors = r.spec?.predictors;
  if (predictors) {
    return predictors.map((/** @type {any} */ p) => (p.kind === 'categorical'
      ? { id: p.id, label: p.id, kind: 'categorical', levels: p.levels || [] }
      : { id: p.id, label: p.id, kind: 'numeric' }));
  }
  return (r._xNames || []).map((/** @type {string} */ name, /** @type {number} */ i) => ({ id: `idx-${i}`, label: name, kind: 'numeric' }));
}

/**
 * ŷ und, wo die Engine es liefert, das Prognoseintervall für eine Eingabe.
 * Texte werden mit Dezimalkomma gelesen.
 * @param {any} r
 * @param {Record<string, number|string>} values je Prädiktor-id der Wert
 * @returns {{ yHat: number, piLow: number|null, piHigh: number|null }|null} `null` bei fehlender oder ungültiger Eingabe
 */
export function predictAt(r, values) {
  if (!r) return null;
  const preds = predictorsOf(r);
  const num = (/** @type {unknown} */ v) => (typeof v === 'number' ? v : parseDecimalInput(/** @type {any} */ (v)));
  if (r.multiX && r.spec) {
    /** @type {Record<string, any[]>} */
    const columns = {};
    for (const p of preds) {
      const v = p.kind === 'categorical' ? values[p.id] : num(values[p.id]);
      if (p.kind === 'categorical' ? !(p.levels ?? []).includes(/** @type {string} */ (v)) : !Number.isFinite(v)) return null;
      columns[p.id] = [v];
    }
    let row;
    try { row = compileModelSpec(r.spec, { columns }).X[0]; } catch { return null; }
    const beta = r._coefficients ?? r.fit?.ols?.beta;
    if (!Array.isArray(beta) || beta.length !== row.length) return null;
    let yHat = 0;
    for (let i = 0; i < row.length; i++) yHat += row[i] * beta[i];
    return { yHat, piLow: null, piHigh: null };
  }
  if (r.multiX && preds.length !== r.xCount) return null;
  const xVals = preds.map((p) => num(values[p.id]));
  if (xVals.some((v) => v == null || !Number.isFinite(v))) return null;
  const pred = r.multiX ? predictMulti(r, /** @type {number[]} */ (xVals)) : predictValue(r, /** @type {number} */ (xVals[0]));
  return { yHat: pred.yHat, piLow: pred.piLow ?? null, piHigh: pred.piHigh ?? null };
}

/**
 * Welche Grade die Daten tragen: gesperrt ist ein Grad, wenn die verwertbaren
 * Zeilen die Termzahl nicht übersteigen (Altform `degreeAvailability`).
 * @param {Inputs} m @param {Source} src
 * @returns {{ n: number, options: Array<{ deg: number, terms: number, disabled: boolean }> }}
 */
export function degreeAvailability(m, src) {
  const k = m.colRefs.length;
  let n = 0;
  const cols = k > 0 && m.yRef ? readInputs(m, src) : null;
  if (cols) {
    const yRaw = numericOf(cols.y);
    const xs = cols.xs.map(numericOf);
    const maxLen = Math.min(yRaw.length, ...xs.map((c) => c.length));
    for (let i = 0; i < maxLen; i++) {
      if (yRaw[i] === null) continue;
      if (xs.every((c) => c[i] !== null)) n++;
    }
  }
  const excludedCount = m.excludedTerms.length;
  const options = DEGREES.map((deg) => {
    const all = polyTermCount(k || 1, deg);
    const terms = deg === m.polyDegree ? all - excludedCount : all;
    return { deg, terms, disabled: n > 0 && n <= terms };
  });
  return { n, options };
}
