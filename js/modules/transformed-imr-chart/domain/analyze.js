/**
 * D.Mike — Transformierte I-MR-Karte: die Rechnung als Zahlen (domain/analyze.js).
 *
 * Die Zahlen einer Spalte an die Engine `computeTransformedIMR`, genau wie das
 * Altmodul sie aufrief: Box-Cox mit geschätztem (Modus `auto`) oder
 * vorgegebenem λ (Modus `manual`), I-MR-Grenzen auf der transformierten Skala
 * und die zurücktransformierten Grenzen der Einzelwertkarte. Rein: keine
 * Übersetzung, keine Formatierung; Fehler sind Gründe (i18n-Schlüssel), keine
 * Texte. Teuer ist allein die Schätzung von λ (121 Transformationen mit je
 * einem Anderson-Darling-Test); darum rechnet ein auto-Task, und `analyze`
 * merkt sich die letzte Eingabe.
 */
import { computeTransformedIMR } from '../../../engines/transformed-chart-engine.js';
import { finiteOrNull, zipPoints } from '../../../core/agent/agent-results.js';

/** Weniger Zahlen rechnet das Modul nicht. */
export const MIN_VALUES = 5;

/**
 * Das gerechnete Ergebnis, wie `read().result` der Altform es lieferte.
 * Die Signalindizes zählen die verwerteten Zahlen, nicht die Zeilen.
 *
 * @typedef {object} Result
 * @property {number} n  verwertete Werte
 * @property {number|null} lambda  verwendetes λ
 * @property {boolean} lambdaAuto  λ geschätzt
 * @property {IndividualLimits} i  Einzelwertkarte, transformiert
 * @property {Limits} mr  Karte der gleitenden Spannweiten, transformiert
 * @property {Limits} iOriginal  Einzelwertkarte, zurücktransformiert
 * @property {number[]} signals  Signalpunkte der Einzelwertkarte
 */

/**
 * @typedef {object} IndividualLimits
 * @property {number|null} cl  Mittellinie
 * @property {number|null} ucl  obere Eingriffsgrenze
 * @property {number|null} lcl  untere Eingriffsgrenze
 * @property {number|null} sigma  Streuung
 */

/**
 * @typedef {object} Limits
 * @property {number|null} cl  Mittellinie
 * @property {number|null} ucl  obere Eingriffsgrenze
 * @property {number|null} lcl  untere Eingriffsgrenze
 */

/**
 * Ein verwerteter Wert in Datenfolge.
 * @typedef {object} Point
 * @property {number|null} transformed  der transformierte Wert
 * @property {boolean} signal  außerhalb der Grenzen der Einzelwertkarte
 */

/**
 * Der Wert des Tasks `analysis`.
 * @typedef {object} AnalysisValue
 * @property {Result|null} result  das Ergebnis; null ohne Spalte, unter 5 Zahlen oder bei Fehler
 * @property {Point[]} points  je verwertetem Wert eine Zeile; leer ohne Ergebnis
 * @property {'errPositiveOnly'|'errCompute'|null} error  Grund, warum nicht gerechnet wurde
 * @property {string|null} message  der Text zum Grund in der aktiven Sprache
 */

/**
 * Das Rohergebnis der Engine.
 * @typedef {import('../../../engines/transformed-chart-engine.js').TransformedIMRResult} Fit
 */

/**
 * Was `analyze` liefert: Ergebnis oder Fehlergrund.
 * @typedef {{ status: 'ok', fit: Fit, n: number }
 *   | { status: 'error', reason: 'errPositiveOnly'|'errCompute' }} Analysis
 */

/**
 * Die Zahlen der gewählten Spalte: nur echte Zahlen (kein `NaN`, kein Text
 * wie „2,5“), wie das Altmodul. Ohne Bezug oder bei unlesbarer Spalte eine
 * leere Liste.
 * @param {{ columnRef: object|null }} model
 * @param {{ values: (ref: object) => any[]|null }} read Spaltenleser (`sourceColumns`)
 * @returns {number[]}
 */
export function inputValues(model, read) {
  if (!model.columnRef) return [];
  const raw = read.values(model.columnRef) ?? [];
  return raw.filter((v) => typeof v === 'number' && !Number.isNaN(v));
}

/**
 * Das λ, das an die Engine geht: im Modus `manual` das gespeicherte, sonst
 * `undefined` (die Engine schätzt). Liest `lambdaManual` nur im Modus
 * `manual`, damit eine Änderung des gesperrten Felds keinen Lauf auslöst.
 * @param {{ lambdaMode: string, lambdaManual: number }} model
 * @returns {number|undefined}
 */
export function lambdaOf(model) {
  return model.lambdaMode === 'manual' ? model.lambdaManual : undefined;
}

/** @param {readonly any[]} a @param {readonly any[]} b @returns {boolean} */
const sameList = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Die letzte Eingabe und ihr Ergebnis. Ein Neustart des Tasks ohne geänderte
 * Eingabe (Sprachwechsel, Neueinhängen) rechnet so nicht neu.
 * @type {{ values: number[], lambda: number|undefined, analysis: Analysis|null }|null}
 */
let last = null;

/** Wie oft die Engine gelaufen ist (Zählung für Tests und Messung). */
let runs = 0;

/**
 * Wie oft `analyze` die Engine bisher aufgerufen hat. Nur zum Zählen in
 * Tests und Messungen; der Wert steigt nur, wenn wirklich gerechnet wird.
 * @returns {number}
 */
export function engineRuns() { return runs; }

/**
 * Rechnet die transformierte I-MR-Karte. Unter fünf Zahlen `null` (keine
 * Ausgabe, kein Fehler). Bei gleichen Zahlen (flach verglichen) und gleichem
 * λ wie beim letzten Aufruf kommt dasselbe Objekt zurück; es wird nicht
 * verändert.
 * @param {number[]} values
 * @param {number|undefined} lambda vorgegebenes λ, `undefined` schätzt
 * @returns {Analysis|null}
 */
export function analyze(values, lambda) {
  if (last && Object.is(last.lambda, lambda) && sameList(last.values, values)) return last.analysis;
  const analysis = compute(values, lambda);
  last = { values: [...values], lambda, analysis };
  return analysis;
}

/** @param {number} v @returns {boolean} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Die Rechnung selbst, ohne Zwischenspeicher.
 * @param {number[]} values
 * @param {number|undefined} lambda
 * @returns {Analysis|null}
 */
function compute(values, lambda) {
  if (values.length < MIN_VALUES) return null;
  if (values.some((v) => v <= 0)) return { status: 'error', reason: 'errPositiveOnly' };
  runs += 1;
  /** @type {Fit} */
  let fit;
  try {
    fit = computeTransformedIMR(values, { lambda });
  } catch (e) {
    if (e?.message === 'errPositiveOnly') return { status: 'error', reason: 'errPositiveOnly' };
    console.warn('transformed-imr-chart: computeTransformedIMR', e);
    return { status: 'error', reason: 'errCompute' };
  }
  const { cl, ucl, lcl } = fit.iLimits;
  if (!fit.transformed.every(finite) || ![cl, ucl, lcl].every(finite)) {
    console.warn('transformed-imr-chart: nicht endliche transformierte Werte oder Grenzen', { lambda: fit.lambda, cl, ucl, lcl });
    return { status: 'error', reason: 'errCompute' };
  }
  return { status: 'ok', fit, n: values.length };
}

/**
 * @param {Record<string, any>} o
 * @param {string[]} keys
 * @returns {any}
 */
const limits = (o, keys) => Object.fromEntries(keys.map((k) => [k, finiteOrNull(o[k])]));

/**
 * Das Ergebnis in der Form von `read().result` der Altform; keine Funktionen,
 * Zahlen über `finiteOrNull`.
 * @param {Analysis|null} analysis
 * @returns {Result|null} null ohne Ergebnis oder bei Fehler
 */
export function resultOf(analysis) {
  if (analysis?.status !== 'ok') return null;
  const { fit: r, n } = analysis;
  return {
    n,
    lambda: finiteOrNull(r.lambda),
    lambdaAuto: Boolean(r.lambdaAuto),
    i: limits(r.iLimits, ['cl', 'ucl', 'lcl', 'sigma']),
    mr: limits(r.mrLimits, ['cl', 'ucl', 'lcl']),
    iOriginal: limits(r.iLimitsOriginal, ['cl', 'ucl', 'lcl']),
    signals: [...r.signalsI],
  };
}

/**
 * Je verwertetem Wert eine Zeile in Datenfolge.
 * @param {Analysis|null} analysis
 * @returns {Point[]} leer ohne Ergebnis oder bei Fehler
 */
export function pointsOf(analysis) {
  if (analysis?.status !== 'ok') return [];
  return /** @type {Point[]} */ (zipPoints({ transformed: analysis.fit.transformed }, { signal: analysis.fit.signalsI }).rows);
}

/**
 * Das angezeigte λ (Heilung beim Lesen): im Modus `auto` mit Ergebnis dessen
 * λ, sonst der gespeicherte `lambdaManual`. Der gespeicherte Wert bleibt im
 * Modus `auto` unverändert.
 * @param {{ lambdaMode: string, lambdaManual: number }} model
 * @param {Result|null} result
 * @returns {number}
 */
export function shownLambda(model, result) {
  if (model.lambdaMode !== 'manual' && result && result.lambda != null) return result.lambda;
  return model.lambdaManual;
}
