/**
 * D.Mike — GLM-Regression: die Rechnung (domain/analyze.js). Rein.
 *
 * Wie die Altform (`runAnalysis`, `fitAndDisplay`): Familie wählen (fest oder
 * über `autoDetect`), binomiale Zielgrößen prüfen und auf 0/1 abbilden,
 * `fitGLM` rechnen, bei überdisperser Poisson-Anpassung Quasi-Poisson, dazu
 * Hebel, Cook-Distanzen, VIF, ROC, Hosmer-Lemeshow und Überdispersion. Die
 * Statistik bleibt in `engines/glm-engine.js`. Fehler sind Gründe
 * (i18n-Schlüssel mit Parametern), keine Texte. `analyze` merkt sich je Model
 * die letzte Eingabe; die Schwelle `cutoff` gehört nicht dazu (sie zählt nur
 * die Konfusionstafel neu).
 */
import {
  autoDetect, fitGLM, buildGLMDesignMatrix, computeROC, classificationTable, hosmerLemeshow,
  overdispersionCheck, hatValues, cookDistance, computeGLMVIF, predictGLM,
} from '../../../engines/glm-engine.js';
import { formatNumber, roundTo, decimalSeparator } from '../../../core/number-format.js';
import { parseDecimalInput } from '../../../core/parse-decimal.js';
import { readInputs, fitDataOf } from './columns.js';

/** @typedef {import('../../../core/source-reader.js').Source} Source */
/** @typedef {import('./columns.js').ColumnRef} ColumnRef */
/** @typedef {import('./columns.js').FitData} FitData */

/** Die Verfahren in Reihenfolge der Oberfläche (gleich dem Literal im Schema). */
export const METHODS = Object.freeze(/** @type {const} */ (['auto', 'binomial', 'poisson', 'negbin']));

/**
 * Der Eingabestand der Rechnung.
 * @typedef {object} Inputs
 * @property {readonly ColumnRef[]} colRefs
 * @property {ColumnRef|null} yRef
 * @property {ColumnRef|null} trialsRef
 * @property {number|null} successClass
 * @property {string} method
 * @property {number} confLevel
 */

/**
 * Die automatische Wahl der Familie.
 * @typedef {object} AutoChoice
 * @property {string} reasonKey  i18n-Schlüssel des Grunds
 * @property {string} familyName  gewählte Familie
 */

/**
 * Die Rechnung zum Stand.
 * @typedef {object} Analysis
 * @property {'none'|'fit'|'error'} kind
 * @property {any} fit  volles Ergebnis der Engine mit den Zusätzen der Altform (`_hat`, `_cooks`, …) oder `null`
 * @property {FitData|null} data  die gezählten Zeilen
 * @property {{ reason: string, params: Record<string, any>|null }|null} error
 * @property {AutoChoice|null} auto  Grund der automatischen Wahl, `null` bei festem Verfahren
 * @property {{ success: number, failure: number }|null} successInfo  Stufen einer binären Zielgröße
 */

/** @type {Analysis} */
const NONE = Object.freeze({ kind: 'none', fit: null, data: null, error: null, auto: null, successInfo: null });

/** Merker je Model. @type {WeakMap<object, { key: string, value: Analysis }>} */
const memos = new WeakMap();

/** Zahl der Engine-Läufe (für Tests des Merkers). */
let runs = 0;
/** @returns {number} */
export function engineRuns() { return runs; }

/**
 * @param {string} reason @param {Record<string, any>|null} [params] @param {Partial<Analysis>} [extra]
 * @returns {Analysis}
 */
const fail = (reason, params = null, extra = {}) => ({ ...NONE, ...extra, kind: 'error', error: { reason, params } });

/**
 * Ereignisse je Prädiktor eines binomialen Fits (Peduzzi u. a. 1996): die
 * seltenere Klasse über die Koeffizienten ohne Achsenabschnitt; gruppierte
 * Daten zählen Versuche.
 * @param {number[]} y @param {number[]|null} weights @param {number} p
 * @returns {number} Infinity bei einem Modell nur mit Achsenabschnitt
 */
export function eventsPerPredictor(y, weights, p) {
  let events = 0;
  let total = 0;
  for (let i = 0; i < y.length; i++) {
    const w = weights ? weights[i] : 1;
    events += y[i] * w;
    total += w;
  }
  return Math.min(events, total - events) / (p - 1);
}

/**
 * Familie und Link zum Verfahren; `auto` über `autoDetect`.
 * @param {string} method @param {number[]} y
 * @returns {{ familyName: string, link: string, auto: AutoChoice|null }}
 */
function familyOf(method, y) {
  if (method === 'auto') {
    const d = autoDetect(y);
    return { familyName: d.familyName, link: d.link, auto: { reasonKey: d.reasonKey, familyName: d.familyName } };
  }
  return { familyName: method, link: method === 'binomial' ? 'logit' : 'log', auto: null };
}

/**
 * Fit zum Stand rechnen (ohne Merker).
 * @param {Inputs} m @param {FitData} fd
 * @returns {Analysis}
 */
function compute(m, fd) {
  const y = [...fd.y];
  const weights = fd.weights;
  if (y.length < 3) return fail('errorTooFew', null, { data: fd });
  const columns = fd.xCols.map((vals, j) => ({ values: vals, name: fd.xNames[j], categorical: fd.xIsCat[j] }));
  const { X, terms } = buildGLMDesignMatrix(columns);
  const fam = familyOf(m.method, y);
  const base = { data: fd, auto: fam.auto };
  /** @type {{ success: number, failure: number }|null} */
  let successInfo = null;
  if (fam.familyName === 'binomial') {
    if (weights) {
      for (let i = 0; i < y.length; i++) {
        if (y[i] < 0 || y[i] > 1) return fail('errorProportionRange', null, base);
        if (weights[i] < 1 || !Number.isFinite(weights[i])) return fail('errorTrialsInvalid', null, base);
      }
    } else {
      const unique = new Set(y);
      if (unique.size > 2 || unique.size === 1) return fail('errorNotBinary', null, base);
      const levels = [...unique].sort((a, b) => a - b);
      const success = m.successClass !== null && unique.has(m.successClass) ? m.successClass : levels[1];
      const failure = success === levels[0] ? levels[1] : levels[0];
      if (!(success === 1 && failure === 0)) for (let i = 0; i < y.length; i++) y[i] = y[i] === success ? 1 : 0;
      successInfo = { success, failure };
    }
  }
  const n = y.length;
  const p = X[0].length;
  if (n <= p) return fail('errorTooFewForP', null, base);
  // Die JSDoc der Engine kennt `weights` und `estimateDispersion` nicht.
  /** @type {any} */
  const opts = { familyName: fam.familyName, link: fam.link, terms, confLevel: m.confLevel, weights: weights ?? undefined };
  let r;
  let quasi = false;
  try {
    r = fitGLM(X, y, opts);
    if (r.converged && fam.familyName === 'poisson') {
      const od = overdispersionCheck(r.pearsonResiduals, r.n, r.p);
      if (od.overdispersed) {
        r = fitGLM(X, y, { ...opts, estimateDispersion: true });
        quasi = true;
      }
    }
  } catch (err) {
    return fail('errorFit', { message: /** @type {Error} */ (err)?.message ?? String(err) }, base);
  }
  if (!r.converged) return fail('errorNoConverge', null, base);
  r._yName = fd.yName;
  r._xNames = fd.xNames;
  r._quasiActivated = quasi;
  if (successInfo) r._successClassInfo = successInfo;
  const hat = hatValues(X, r.invXtWX, r.irlsWeights);
  r._hat = hat;
  r._cooks = cookDistance(r.pearsonResiduals, hat, p, r.dispersion);
  if (X[0].length > 2) r._vifs = computeGLMVIF(X, r.irlsWeights);
  if (fam.familyName === 'binomial') {
    r._roc = computeROC(y, r.fittedValues, weights ?? undefined);
    r._hl = hosmerLemeshow(y, r.fittedValues, 10, weights ?? undefined);
    r._epv = eventsPerPredictor(y, weights, p);
  }
  if (fam.familyName === 'poisson') r._overdispersion = overdispersionCheck(r.pearsonResiduals, n, p);
  r._X = X;
  return { kind: 'fit', fit: r, data: fd, error: null, auto: fam.auto, successInfo };
}

/**
 * Die Rechnung zum Stand, je Model gemerkt. Ohne X oder Y: kein Ergebnis und
 * kein Grund (Altform `autoRun`).
 * @param {Inputs} m
 * @param {Source} src
 * @returns {Analysis}
 */
export function analyze(m, src) {
  if (!Array.isArray(m.colRefs) || m.colRefs.length === 0 || !m.yRef) return NONE;
  const cols = readInputs(m, src);
  if (!cols) return fail('errColumnMissing');
  const key = JSON.stringify([m.method, m.confLevel, m.successClass, cols]);
  const memo = memos.get(m);
  if (memo && memo.key === key) return memo.value;
  runs++;
  const value = compute(m, fitDataOf(cols));
  memos.set(m, { key, value });
  return value;
}

/** @param {unknown} v @returns {number|null} */
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Eine Zahl wie die Altform (`fmt`): feste Stellen, sehr groß oder klein in
 * Exponentialschreibweise; Gedankenstrich ohne Wert.
 * @param {number|null|undefined} v @param {number} d @param {string} lang
 * @returns {string}
 */
export function fixed(v, d, lang) {
  if (v == null || !Number.isFinite(v)) return '–';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d).replace('.', decimalSeparator(lang));
  return formatNumber(v, lang, { profile: 'input', decimals: d });
}

/**
 * Die Modellgleichung (Altform `buildEquation`), vier Stellen.
 * @param {any} r @param {string} lang
 * @returns {string}
 */
export function equationOf(r, lang) {
  const lhs = r.family.name === 'binomial' ? 'logit(p)' : 'log(μ)';
  let eq = `${lhs} = ${fixed(r.coefficients[0], 4, lang)}`;
  for (let j = 1; j < r.terms.length; j++) {
    const c = r.coefficients[j];
    const term = r.terms[j];
    eq += ` ${c >= 0 ? '+' : '−'} ${fixed(Math.abs(c), 4, lang)}·${term.includes('·') ? `(${term})` : term}`;
  }
  return eq;
}

/**
 * Die Warnungen eines Fits als Codes mit Zahlen (Altform `glmWarnings`).
 * @param {any} r
 * @returns {Array<{ code: string, values: Record<string, number|null> }>}
 */
export function warningsOf(r) {
  /** @type {Array<{ code: string, values: Record<string, number|null> }>} */
  const out = [];
  const w = (/** @type {string} */ code, /** @type {Record<string, any>} */ values = {}) => {
    out.push({ code, values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, num(v)])) });
  };
  if (r.separationStrong) w('warnSeparationStrong');
  else if (r.separationDetected) w('warnSeparation');
  if (r.family.name === 'binomial') {
    if (r._epv < 10) w('warnFewEvents', { epv: r._epv });
  } else if (r.n / r.p < 10) {
    w('warnSmallN', { n: r.n, p: r.p });
  }
  if (r.iterations >= 40) w('warnSlowConverge', { iterations: r.iterations });
  if (r._overdispersion?.overdispersed) w('warnOverdispersion', { ratio: r._overdispersion.ratio });
  if (r._quasiActivated) w('warnQuasiActivated', { phi: r.dispersion });
  if (r.thetaEstimated && r.thetaConverged === false) w('warnThetaUnstable', { theta: r.family?.theta });
  return out;
}

/**
 * Eine Warnung als Text; die Zahlen mit den Stellen der Altform.
 * @param {{ code: string, values: Record<string, number|null> }} w
 * @param {(key: string, params?: object) => string} t
 * @param {string} lang
 * @returns {string}
 */
export function warningText(w, t, lang) {
  if (w.code === 'warnFewEvents') return t(w.code, { epv: fixed(w.values.epv, 1, lang) });
  if (w.code === 'warnQuasiActivated') return t(w.code, { phi: fixed(w.values.phi, 2, lang) });
  if (w.code === 'warnThetaUnstable') return t(w.code, { theta: fixed(w.values.theta, 2, lang) });
  return t(w.code);
}

/**
 * Die Überdispersionsprüfung als Zahlen; `null` ohne Poisson-Prüfung.
 * @param {any} od
 * @returns {{ pearsonChi2: number|null, df: number|null, ratio: number|null, overdispersed: boolean }|null}
 */
export function overdispersionOf(od) {
  if (!od) return null;
  return { pearsonChi2: num(od.pearsonChi2), df: num(od.df), ratio: num(od.ratio), overdispersed: Boolean(od.overdispersed) };
}

/**
 * Der Fit als Zahlen für `read()` (Altform `_agentResult`). Warnungen und
 * Gleichung in der Sprache `lang`.
 * @param {Analysis} a
 * @param {(key: string, params?: object) => string} t
 * @param {string} lang
 * @returns {any}
 */
export function agentResult(a, t, lang) {
  const r = a.fit;
  if (!r) return null;
  const isBinomial = r.family.name === 'binomial';
  const isCount = r.family.name === 'poisson' || r.family.name === 'negbin';
  const ratioOf = (/** @type {number} */ j) => {
    if (j === 0) return null;
    if (isBinomial && r.oddsRatios?.[j]) {
      const o = r.oddsRatios[j];
      return { value: num(o.or), lower: num(o.lower), upper: num(o.upper) };
    }
    if (isCount && r.rateRatios?.[j]) {
      const o = r.rateRatios[j];
      return { value: num(o.rr), lower: num(o.lower), upper: num(o.upper) };
    }
    return null;
  };
  const warnings = warningsOf(r);
  return {
    family: { name: r.family.name, link: r.family.link, theta: r.family.name === 'negbin' ? num(r.family.theta) : null },
    quasi: Boolean(r._quasiActivated),
    autoReason: a.auto?.reasonKey ?? null,
    n: num(r.n),
    iterations: num(r.iterations),
    aic: num(r.aic),
    bic: num(r.bic),
    deviance: num(r.deviance),
    nullDeviance: num(r.nullDeviance),
    logLikelihood: num(r.logLikelihood),
    pseudoR2: { mcfadden: num(r.pseudoR2?.mcfadden), nagelkerke: num(r.pseudoR2?.nagelkerke), coxSnell: num(r.pseudoR2?.coxSnell) },
    coefficients: r.terms.map((/** @type {string} */ term, /** @type {number} */ j) => ({
      term,
      estimate: num(r.coefficients[j]),
      se: num(r.stdErrors?.[j]),
      z: num(r.zValues?.[j]),
      p: num(r.pValues?.[j]),
      ciLower: num(r.ciLower?.[j]),
      ciUpper: num(r.ciUpper?.[j]),
      ratio: ratioOf(j),
    })),
    auc: num(r._roc?.auc),
    hosmerLemeshow: r._hl ? { statistic: num(r._hl.statistic), pValue: num(r._hl.pValue) } : null,
    overdispersionRatio: num(r._overdispersion?.ratio),
    overdispersion: overdispersionOf(r._overdispersion),
    vif: Array.isArray(r._vifs) ? r._vifs.map(num) : null,
    vifTerms: Array.isArray(r._vifs) ? r._vifs.map((/** @type {unknown} */ _, /** @type {number} */ j) => r.terms[j + 1]) : null,
    warnings: warnings.map((w) => warningText(w, t, lang)),
    warningDetails: warnings,
    equation: equationOf(r, lang),
  };
}

/**
 * Die Konfusionstafel zur Schwelle; `null` ohne binomialen Fit.
 * @param {Analysis} a @param {number} cutoff
 * @returns {{ cutoff: number, tp: number, fn: number, fp: number, tn: number,
 *   sensitivity: number|null, specificity: number|null, accuracy: number|null, precision: number|null }|null}
 */
export function classificationOf(a, cutoff) {
  const r = a.fit;
  if (!r || r.family.name !== 'binomial') return null;
  const ct = classificationTable(r.y, r.fittedValues, cutoff, r.priorWeights ?? undefined);
  return {
    cutoff, tp: ct.tp, fn: ct.fn, fp: ct.fp, tn: ct.tn,
    sensitivity: num(ct.sensitivity), specificity: num(ct.specificity),
    accuracy: num(ct.accuracy), precision: num(ct.precision),
  };
}

/**
 * Die Terme, die eine Vorhersage nimmt (ohne Achsenabschnitt).
 * @param {Analysis} a
 * @returns {string[]}
 */
export function predictionTermsOf(a) {
  return a.fit ? a.fit.terms.slice(1) : [];
}

/**
 * Vorhersage für Werte je Term (Altform `predictFor`); Texte mit
 * Dezimalkomma gelten. `null`, wenn ein Term ohne lesbaren Wert bleibt.
 * @param {any} fit
 * @param {Record<string, number|string>} values
 * @returns {{ linear: number, response: number, ciLower: number|null, ciUpper: number|null }|null}
 */
export function predictFor(fit, values) {
  if (!fit) return null;
  const row = [1];
  for (let j = 1; j < fit.terms.length; j++) {
    const raw = values?.[fit.terms[j]];
    const v = typeof raw === 'number' ? raw : parseDecimalInput(raw);
    if (v === null || !Number.isFinite(v)) return null;
    row.push(v);
  }
  const pred = /** @type {any} */ (predictGLM(fit, [row]));
  return {
    linear: pred.linear[0],
    response: pred.response[0],
    ciLower: pred.ciValid ? pred.ciLower[0] : null,
    ciUpper: pred.ciValid ? pred.ciUpper[0] : null,
  };
}

/**
 * Das Gegenstück eines Anteils, gerundet gegen Rechenrauschen (1 − 0,9).
 * @param {number} v
 * @returns {number}
 */
export const complement = (v) => roundTo(1 - v, 10);
