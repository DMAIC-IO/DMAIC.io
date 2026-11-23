/**
 * D.Mike — Ausreißertest: die Rechnung als Zahlen (domain/analyze.js).
 *
 * Die sieben Verfahren der Engine auf den Zahlen einer Spalte, genau wie das
 * Altmodul sie aufrief. Rein: keine Übersetzung, keine Formatierung; wo ein
 * Verfahren nicht rechenbar ist, steht sein Fehlercode der Engine. Den Text
 * baut der Presenter.
 */
import {
  grubbsTest, dixonQTest, generalizedESD,
  tukeyIQR, hampelIdentifier, zScoreOutliers, modifiedZScore,
} from '../../../engines/outlier-test-engine.js';

/** Alle Verfahren in der festen Reihenfolge des Moduls. */
export const ALL_METHODS = Object.freeze([
  'grubbs', 'dixon-q', 'generalized-esd', 'tukey-iqr', 'hampel', 'z-score', 'modified-z',
]);

/** Zulässige Seiten der Tests (Grubbs, Dixon Q). */
export const VALID_SIDES = Object.freeze(['two-sided', 'upper', 'lower']);

/** Die acht Parameter in fester Reihenfolge (keiner wird je abgeschaltet). */
export const PARAM_KEYS = Object.freeze(['alpha', 'side', 'tukeyFactor', 'hampelK', 'zThreshold',
  'modZThreshold', 'esdMaxOutliers', 'enabled']);

/** Die Schlüssel von `MethodMetrics`; Karten und Hilfetor lesen dieselbe Liste. */
export const METRIC_KEYS = Object.freeze([
  'statistic', 'critical', 'pValue', 'mean', 'sd', 'detected', 'maxOutliers',
  'q1', 'median', 'q3', 'iqr', 'fenceLower', 'fenceUpper', 'mad', 'madScaled', 'k', 'threshold',
]);

/** Die Schlüssel von `EsdStep`, die die Schrittetabelle als Spalten zeigt. */
export const ESD_STEP_KEYS = Object.freeze(['i', 'value', 'R', 'lambda']);

/** Weniger Zahlen rechnet das Modul nicht. */
export const MIN_VALUES = 3;

/**
 * Das gerechnete Ergebnis, wie `read().result` es liefert. Die Indizes zählen
 * die verwerteten Zahlen ab 0, nicht die Zeilen.
 *
 * @typedef {object} Result
 * @property {number} n  verwertete Zahlen
 * @property {number[]} flaggedIdxs  von mindestens einem Verfahren markiert
 * @property {MethodResult[]} methods  je aktivem Verfahren
 */

/**
 * @typedef {object} MethodResult
 * @property {string} id  Verfahren
 * @property {number[]} flagged  markierte Punkte
 * @property {string|null} error  Fehlerkennung
 * @property {MethodMetrics|null} metrics  Kennzahlen der Karte; leer, wenn das Verfahren nicht anwendbar ist
 * @property {EsdStep[]|null} steps  Schritte der Generalized ESD; nur dort, sonst leer
 */

/**
 * Die Kennzahlen eines Verfahrens, dieselben Zahlen wie auf seiner Karte. Welche
 * Schlüssel da sind, hängt vom Verfahren ab.
 *
 * @typedef {object} MethodMetrics
 * @property {number|null} [statistic]  Prüfgröße G (Grubbs) bzw. Q (Dixon Q)
 * @property {number|null} [critical]  kritischer Wert zur Prüfgröße
 * @property {number|null} [pValue]  p-Wert (nur Grubbs)
 * @property {number|null} [mean]  Mittelwert (Grubbs, Z-Score)
 * @property {number|null} [sd]  Standardabweichung (Grubbs, Z-Score)
 * @property {number|null} [detected]  erkannte Ausreißer (Generalized ESD)
 * @property {number|null} [maxOutliers]  geprüfte Höchstzahl (Generalized ESD)
 * @property {number|null} [q1]  erstes Quartil (Tukey)
 * @property {number|null} [median]  Median (Tukey, Hampel, Modified Z-Score)
 * @property {number|null} [q3]  drittes Quartil (Tukey)
 * @property {number|null} [iqr]  Quartilsabstand (Tukey)
 * @property {number|null} [fenceLower]  untere Schranke (Tukey)
 * @property {number|null} [fenceUpper]  obere Schranke (Tukey)
 * @property {number|null} [mad]  MAD (Hampel, Modified Z-Score)
 * @property {number|null} [madScaled]  1,4826·MAD (Hampel)
 * @property {number|null} [k]  Schwelle k (Hampel)
 * @property {number|null} [threshold]  Schwelle (Hampel, Z-Score, Modified Z-Score)
 */

/**
 * Ein Schritt der Generalized ESD.
 *
 * @typedef {object} EsdStep
 * @property {number} i  Nummer des Schritts ab 1
 * @property {number} value  der Wert, der in diesem Schritt geprüft wird
 * @property {number} R  Prüfgröße Rᵢ
 * @property {number} lambda  kritischer Wert λᵢ
 */

/**
 * Das Rohergebnis aller aktiven Verfahren: je Verfahren das Ergebnis der
 * Engine oder ihr Fehlercode.
 *
 * @typedef {object} Analysis
 * @property {Record<string, any>} results  Rohergebnis der Engine je Verfahren
 * @property {Record<string, string>} errs  Fehlercode je Verfahren
 */

/**
 * Die Eingaben der Rechnung (Felder des Models).
 *
 * @typedef {object} AnalysisParams
 * @property {number} alpha
 * @property {'two-sided'|'upper'|'lower'} side
 * @property {number} tukeyFactor
 * @property {number} hampelK
 * @property {number} zThreshold
 * @property {number} modZThreshold
 * @property {number|null} esdMaxOutliers
 * @property {readonly string[]} enabled
 */

/** Zahl oder leer: nicht endliche Werte (NaN, Infinity) werden zu null. */
const num = (/** @type {any} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Die Zahlen der gewählten Spalte in Zeilenreihenfolge. Es zählen nur Werte
 * vom Typ Zahl (ohne `NaN`), wie im Altmodul; Text wie „2,5“ zählt nicht.
 * Ohne Bezug oder bei unlesbarer Spalte eine leere Liste.
 * @param {{ colRef: object|null }} model
 * @param {{ values: (ref: object) => any[]|null }} read Spaltenleser (`sourceColumns`)
 * @returns {number[]}
 */
export function inputValues(model, read) {
  if (!model.colRef) return [];
  const raw = read.values(model.colRef) ?? [];
  return raw.filter((v) => typeof v === 'number' && !Number.isNaN(v));
}

/** Die Felder, von denen die Rechnung abhängt (ohne `enabled`, das als Liste verglichen wird). */
const INPUT_KEYS = Object.freeze(['alpha', 'side', 'tukeyFactor', 'hampelK', 'zThreshold', 'modZThreshold', 'esdMaxOutliers']);

/** @param {readonly any[]} a @param {readonly any[]} b @returns {boolean} */
const sameList = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Die letzte Eingabe und ihr Ergebnis. Ergebnis, Diagrammwahl und Ansicht
 * rechnen je Änderung mit denselben Eingaben; so läuft die Rechnung nur einmal.
 * @type {{ values: number[], params: any[], enabled: string[], analysis: Analysis|null }|null}
 */
let last = null;

/**
 * Rechnet alle aktiven Verfahren. Unter drei Zahlen `null`. Bei gleicher
 * Eingabe wie beim letzten Aufruf (Zahlen und Parameter, flach verglichen)
 * kommt dasselbe Ergebnisobjekt zurück; es wird nicht verändert.
 * @param {number[]} values
 * @param {AnalysisParams} model
 * @returns {Analysis|null}
 */
export function analyze(values, model) {
  const params = INPUT_KEYS.map((k) => /** @type {any} */ (model)[k]);
  const enabled = [...model.enabled];
  if (last && sameList(last.values, values) && sameList(last.params, params) && sameList(last.enabled, enabled)) {
    return last.analysis;
  }
  const analysis = compute(values, model);
  last = { values: [...values], params, enabled, analysis };
  return analysis;
}

/**
 * Die Rechnung selbst, ohne Zwischenspeicher.
 * @param {number[]} values
 * @param {AnalysisParams} model
 * @returns {Analysis|null}
 */
function compute(values, model) {
  if (values.length < MIN_VALUES) return null;
  const { alpha, side } = model;
  const enabled = new Set(model.enabled);
  /** @type {Record<string, any>} */
  const results = {};
  /** @type {Record<string, string>} */
  const errs = {};
  const safe = (/** @type {string} */ id, /** @type {() => any} */ fn) => {
    if (!enabled.has(id)) return;
    try { results[id] = fn(); } catch (e) { errs[id] = /** @type {any} */ (e)?.message || 'error'; }
  };
  safe('grubbs', () => grubbsTest(values, alpha, side));
  safe('dixon-q', () => dixonQTest(values, alpha, side));
  safe('generalized-esd', () => generalizedESD(values, alpha, model.esdMaxOutliers ?? undefined));
  safe('tukey-iqr', () => tukeyIQR(values, model.tukeyFactor));
  safe('hampel', () => hampelIdentifier(values, model.hampelK));
  safe('z-score', () => zScoreOutliers(values, model.zThreshold));
  safe('modified-z', () => modifiedZScore(values, model.modZThreshold));
  return { results, errs };
}

/**
 * Die Kennzahlen eines Verfahrens aus dem Rohergebnis der Engine — die eine
 * Quelle für die Karte und die Lesefläche.
 * @param {string} id Verfahren
 * @param {any} r Rohergebnis des Verfahrens
 * @returns {MethodMetrics|null} null für ein unbekanntes Verfahren
 */
export function methodMetrics(id, r) {
  switch (id) {
    case 'grubbs':
      return { statistic: num(r.statistic), critical: num(r.critical), pValue: num(r.pValue), mean: num(r.mean), sd: num(r.sd) };
    case 'dixon-q':
      return { statistic: num(r.statistic), critical: num(r.critical) };
    case 'generalized-esd':
      return { detected: num(r.detected), maxOutliers: num(r.parameters.maxOutliers) };
    case 'tukey-iqr':
      return { q1: num(r.q1), median: num(r.median), q3: num(r.q3), iqr: num(r.iqr), fenceLower: num(r.fenceLower), fenceUpper: num(r.fenceUpper) };
    case 'hampel':
      return { median: num(r.median), mad: num(r.mad), madScaled: num(r.madScaled), k: num(r.parameters.k), threshold: num(r.threshold) };
    case 'z-score':
      return { mean: num(r.mean), sd: num(r.sd), threshold: num(r.parameters.threshold) };
    case 'modified-z':
      return { median: num(r.median), mad: num(r.mad), threshold: num(r.parameters.threshold) };
    default:
      return null;
  }
}

/**
 * Die markierten Indizes eines Verfahrens; leer bei Fehler.
 * @param {Analysis} analysis @param {string} id @returns {number[]}
 */
export function flaggedOf(analysis, id) {
  const r = analysis.results[id];
  return r && r.outliers ? r.outliers.map((/** @type {{ index: number }} */ o) => o.index) : [];
}

/**
 * Das Ergebnis für den Agenten (ohne Diagrammdaten), je gerechnetem
 * Verfahren in der Reihenfolge von `ALL_METHODS`.
 * @param {number[]} values die verwerteten Zahlen
 * @param {Analysis} analysis
 * @returns {Result}
 */
export function buildResult(values, analysis) {
  const { results, errs } = analysis;
  const union = new Set();
  /** @type {MethodResult[]} */
  const methods = [];
  for (const id of ALL_METHODS) {
    if (!results[id] && !errs[id]) continue;
    const flagged = flaggedOf(analysis, id);
    flagged.forEach((i) => union.add(i));
    const r = results[id];
    const steps = id === 'generalized-esd' && r && Array.isArray(r.steps)
      ? r.steps.map((/** @type {any} */ s) => ({ i: s.i, value: s.value, R: s.R, lambda: s.lambda })) : null;
    methods.push({ id, flagged, error: errs[id] || null, metrics: r ? methodMetrics(id, r) : null, steps });
  }
  return { n: values.length, flaggedIdxs: /** @type {number[]} */ ([...union]).sort((a, b) => a - b), methods };
}

/**
 * Die Ziele der Diagrammwahl: `'all'` und jedes aktive Verfahren, das etwas
 * markiert hat. Ohne Rechnung nur `'all'`.
 * @param {{ enabled: readonly string[] }} model
 * @param {Analysis|null} analysis
 * @returns {string[]}
 */
export function chartMethodOptions(model, analysis) {
  if (!analysis) return ['all'];
  const enabled = new Set(model.enabled);
  return ['all', ...ALL_METHODS.filter((id) => enabled.has(id) && flaggedOf(analysis, id).length > 0)];
}

/**
 * Das Verfahren, das das Diagramm wirklich hervorhebt: das gespeicherte, wenn
 * es unter den Zielen steht, sonst `'all'`. Der gespeicherte Wert bleibt.
 * @param {{ enabled: readonly string[], chartMethod: string }} model
 * @param {Analysis|null} analysis
 * @returns {string}
 */
export function effectiveChartMethod(model, analysis) {
  return chartMethodOptions(model, analysis).includes(model.chartMethod) ? model.chartMethod : 'all';
}
