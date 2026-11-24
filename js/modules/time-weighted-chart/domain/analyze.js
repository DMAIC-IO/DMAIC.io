/**
 * D.Mike — Zeitgewichtete Regelkarten (EWMA, CUSUM): die Rechnung als Zahlen
 * (domain/analyze.js).
 *
 * Die Zahlen der gewählten Spalte an die Engine (`computeEWMA` bzw.
 * `computeCUSUM`), genau wie das Altmodul sie aufrief: Phase I über die
 * ersten `baselineCount` Werte (sonst alle), Ziel aus der Vorgabe oder dem
 * Mittel der Phase I, σ aus der Vorgabe (nur über 0) oder der Schätzung der
 * Phase I. Rein: keine Übersetzung, keine Formatierung; Fehler sind Gründe
 * (i18n-Schlüssel), keine Texte. Die Altform rechnete synchron, darum
 * `derived`; `analyze` merkt sich die letzte Eingabe, damit alle Ableitungen
 * und die Ansicht zusammen die Engine einmal je Änderung rufen.
 */
import { computeEWMA, computeCUSUM, estimateSigma } from '../../../engines/time-weighted-chart-engine.js';
import { finiteOrNull, zipPoints } from '../../../core/agent/agent-results.js';

/** Unter drei Zahlen rechnet das Modul nicht. */
export const MIN_VALUES = 3;

/**
 * Das Register der Kartentypen (Regel M6): je Typ die Namen seiner
 * Parameter unter `params.<typ>` (in der Reihenfolge der Engine-Argumente)
 * und die Engine. Die Schlüssel gleichen denen von `params` im Schema.
 */
export const CHART_TYPES = Object.freeze({
  ewma: Object.freeze({ params: Object.freeze(['lambda', 'L']), engine: computeEWMA }),
  cusum: Object.freeze({ params: Object.freeze(['kSigma', 'hSigma']), engine: computeCUSUM }),
});

/**
 * Das gerechnete Ergebnis, wie `read().result` der Altform es lieferte; die
 * Schlüssel hängen vom Verfahren ab. Die Punktnummern zählen die verwerteten
 * Werte, nicht die Zeilen des Arbeitsblatts.
 *
 * @typedef {object} Result
 * @property {'ewma'|'cusum'} chartType  Verfahren
 * @property {number} n  verwertete Werte
 * @property {number|null} target  Ziel
 * @property {number|null} sigma  Streuung der Einzelwerte
 * @property {number} [lambda]  Gewicht λ, nur EWMA
 * @property {number} [L]  Grenzenbreite L, nur EWMA
 * @property {number|null} [cl]  Mittellinie, nur EWMA
 * @property {number|null} [sigmaSteady]  stationäre Streuung des EWMA
 * @property {number[]} [signals]  Signalpunkte, nur EWMA
 * @property {number|null} [k]  Referenzwert in Messeinheiten, nur CUSUM
 * @property {number|null} [h]  Entscheidungsgrenze in Messeinheiten, nur CUSUM
 * @property {number[]} [signalsHigh]  Signale nach oben, nur CUSUM
 * @property {number[]} [signalsLow]  Signale nach unten, nur CUSUM
 */

/**
 * Ein Punkt der EWMA-Karte in Datenfolge.
 * @typedef {object} EwmaPoint
 * @property {number|null} ewma  der EWMA-Wert z
 * @property {number|null} ucl  obere Grenze an diesem Punkt
 * @property {number|null} lcl  untere Grenze an diesem Punkt
 * @property {boolean} signal  außerhalb der Grenzen
 */

/**
 * Ein Punkt der CUSUM-Karte in Datenfolge.
 * @typedef {object} CusumPoint
 * @property {number|null} cPlus  obere Summe C⁺
 * @property {number|null} cMinus  untere Summe C⁻
 * @property {boolean} signalHigh  C⁺ über h
 * @property {boolean} signalLow  C⁻ über h
 */

/**
 * Grund, warum nicht gerechnet wurde (i18n-Schlüssel des Moduls).
 * @typedef {'errCompute'} Reason
 */

/**
 * Das Rohergebnis der Engine.
 * @typedef {import('../../../engines/time-weighted-chart-engine.js').EWMAResult
 *   | import('../../../engines/time-weighted-chart-engine.js').CUSUMResult} Fit
 */

/**
 * Was an die Engine geht: die verwerteten Werte, der Typ, Ziel, σ und die
 * beiden Parameter des Typs (EWMA λ, L; CUSUM k, h in σ).
 * @typedef {object} Inputs
 * @property {number[]} values
 * @property {'ewma'|'cusum'} type
 * @property {number} target
 * @property {number} sigma
 * @property {number} p1
 * @property {number} p2
 */

/**
 * Was `analyze` liefert: Ergebnis oder Fehlergrund.
 * @typedef {{ status: 'ok', type: 'ewma'|'cusum', fit: Fit, n: number, target: number, sigma: number }
 *   | { status: 'error', reason: Reason }} Analysis
 */

/**
 * Die Zahlen der gewählten Spalte, wie das Altmodul sie filterte: nur echte
 * Zahlen (kein `NaN`, kein Text wie „2,5“, kein `null`). Ohne Bezug `null`,
 * ebenso, wenn die Spalte nicht lesbar ist (gelöscht).
 * @param {{ columnRef: object|null }} model
 * @param {{ values: (ref: object) => any[]|null }} read Spaltenleser (`sourceColumns`)
 * @returns {number[]|null}
 */
export function inputValues(model, read) {
  const ref = model.columnRef;
  if (!ref) return null;
  const values = read.values(ref);
  if (!Array.isArray(values)) return null;
  return values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
}

/**
 * Was aus Werten und Model an die Engine geht. Unter drei Werten `null`.
 * Phase I sind die ersten `baselineCount` Werte (höchstens alle), ohne Angabe
 * alle. Ziel: Vorgabe, sonst Mittel der Phase I. σ: Vorgabe, wenn größer 0,
 * sonst die Schätzung der Phase I nach `sigmaMethod`. Ist σ nicht größer 0
 * (auch `NaN`), `null`: keine Ausgabe, keine Meldung (wie die Altform). Ein
 * unendliches Ziel oder σ (Überlauf) geht weiter und wird in `analyze` zum
 * Grund `errCompute`.
 * @param {number[]|null} values
 * @param {{ chartTypeId: 'ewma'|'cusum', sigmaMethod: 'mr'|'sd', baselineCount: number|null,
 *   targetOverride: number|null, sigmaOverride: number|null,
 *   params: { ewma: { lambda: number, L: number }, cusum: { kSigma: number, hSigma: number } } }} model
 * @returns {Inputs|null}
 */
export function inputsOf(values, model) {
  if (!values || values.length < MIN_VALUES) return null;
  const n = values.length;
  const bc = model.baselineCount;
  const end = bc && bc > 0 ? Math.min(bc, n) : n;
  const baseline = values.slice(0, end);
  const target = model.targetOverride != null
    ? model.targetOverride
    : baseline.reduce((s, x) => s + x, 0) / baseline.length;
  const so = model.sigmaOverride;
  const sigma = so != null && so > 0 ? so : estimateSigma(baseline, model.sigmaMethod);
  if (!(sigma > 0)) return null;
  const type = model.chartTypeId;
  const p = /** @type {Record<string, number>} */ (model.params[type]);
  const [k1, k2] = CHART_TYPES[type].params;
  return { values, type, target, sigma, p1: p[k1], p2: p[k2] };
}

/** @param {readonly number[]} a @param {readonly number[]} b @returns {boolean} */
function sameValues(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/**
 * Die letzte Eingabe und ihr Ergebnis.
 * @type {{ inputs: Inputs|null, analysis: Analysis|null }|null}
 */
let last = null;

/** Wie oft die Engine gelaufen ist (Zählung für Tests). */
let runs = 0;

/**
 * Wie oft die Engine bisher aufgerufen wurde. Nur zum Zählen in Tests; der
 * Wert steigt nur, wenn wirklich gerechnet wird.
 * @returns {number}
 */
export function engineRuns() { return runs; }

/** @param {Inputs|null} a @param {Inputs|null} b @returns {boolean} */
function sameInputs(a, b) {
  if (a === null || b === null) return a === b;
  return a.type === b.type && Object.is(a.target, b.target) && Object.is(a.sigma, b.sigma)
    && Object.is(a.p1, b.p1) && Object.is(a.p2, b.p2) && sameValues(a.values, b.values);
}

/**
 * Rechnet die Karte des gewählten Typs. `inputs` `null` (kein Bezug, unter
 * drei Zahlen, σ nicht größer 0) → `null`: keine Ausgabe, kein Fehler. Bei
 * gleicher Eingabe (Werte flach verglichen, Typ, Ziel, σ und die beiden
 * Parameter) wie beim letzten Aufruf kommt dasselbe Objekt zurück (auch
 * Fehler und `null`); es wird nicht verändert.
 * @param {Inputs|null} inputs
 * @returns {Analysis|null}
 */
export function analyze(inputs) {
  if (last && sameInputs(last.inputs, inputs)) return last.analysis;
  const analysis = inputs ? analyzeWith(CHART_TYPES[inputs.type].engine, inputs) : null;
  last = { inputs: inputs && { ...inputs, values: [...inputs.values] }, analysis };
  return analysis;
}

/** @param {unknown} v @returns {boolean} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** @param {unknown} list @returns {boolean} */
const allFinite = (list) => Array.isArray(list) && list.every(finite);

/**
 * Sind alle Zahlen endlich, die Anzeige und Diagramm erreichen?
 * @param {'ewma'|'cusum'} type
 * @param {any} fit
 * @returns {boolean}
 */
function fitIsFinite(type, fit) {
  if (type === 'ewma') {
    return allFinite(fit.values) && allFinite(fit.ucl) && allFinite(fit.lcl) && allFinite(fit.sigma)
      && finite(fit.cl) && finite(fit.sigmaSteady);
  }
  return allFinite(fit.cPlus) && allFinite(fit.cMinus) && finite(fit.h) && finite(fit.k);
}

/**
 * Die Rechnung selbst, ohne Merker, mit wählbarer Engine (Tests stubben sie,
 * um Würfe und nicht endliche Werte zu prüfen). Ein Wurf der Engine und ein
 * nicht endliches Ziel, σ, z, eine Grenze, C⁺, C⁻, h oder k werden zum Grund
 * `errCompute` (Ursache per `console.warn`).
 * @param {(values: number[], target: number, sigma: number, p1: number, p2: number) => any} engine
 * @param {Inputs|null} inputs
 * @returns {Analysis|null}
 */
export function analyzeWith(engine, inputs) {
  if (inputs === null) return null;
  const { values, type, target, sigma, p1, p2 } = inputs;
  runs += 1;
  /** @type {Fit} */
  let fit;
  try {
    fit = engine(values, target, sigma, p1, p2);
  } catch (e) {
    console.warn(`time-weighted-chart: ${type}`, e);
    return { status: 'error', reason: 'errCompute' };
  }
  if (!finite(target) || !finite(sigma) || !fitIsFinite(type, fit)) {
    console.warn(`time-weighted-chart: nicht endliche Werte (${type})`, { target, sigma });
    return { status: 'error', reason: 'errCompute' };
  }
  return { status: 'ok', type, fit, n: values.length, target, sigma };
}

/**
 * Das Ergebnis in der Form von `read().result` der Altform; keine Funktionen,
 * Zahlen über `finiteOrNull`. λ und L kommen aus dem Model (sie gingen in die
 * Rechnung ein).
 * @param {Analysis|null} analysis
 * @param {{ params: { ewma: { lambda: number, L: number } } }} model
 * @returns {Result|null} null ohne Ergebnis oder bei Fehler
 */
export function resultOf(analysis, model) {
  if (analysis?.status !== 'ok') return null;
  const base = { n: analysis.n, target: finiteOrNull(analysis.target), sigma: finiteOrNull(analysis.sigma) };
  const r = /** @type {any} */ (analysis.fit);
  if (analysis.type === 'ewma') {
    return {
      chartType: 'ewma', ...base, lambda: model.params.ewma.lambda, L: model.params.ewma.L,
      cl: finiteOrNull(r.cl), sigmaSteady: finiteOrNull(r.sigmaSteady), signals: [...r.signals],
    };
  }
  return {
    chartType: 'cusum', ...base, k: finiteOrNull(r.k), h: finiteOrNull(r.h),
    signalsHigh: [...r.signalsHi], signalsLow: [...r.signalsLo],
  };
}

/**
 * Je verwertetem Wert eine Zeile in Datenfolge: EWMA `{ ewma, ucl, lcl,
 * signal }`, CUSUM `{ cPlus, cMinus, signalHigh, signalLow }`.
 * @param {Analysis|null} analysis
 * @returns {Array<EwmaPoint|CusumPoint>} leer ohne Ergebnis oder bei Fehler
 */
export function pointsOf(analysis) {
  if (analysis?.status !== 'ok') return [];
  const r = /** @type {any} */ (analysis.fit);
  if (analysis.type === 'ewma') {
    return /** @type {EwmaPoint[]} */ (zipPoints({ ewma: r.values, ucl: r.ucl, lcl: r.lcl }, { signal: r.signals }).rows);
  }
  return /** @type {CusumPoint[]} */ (zipPoints({ cPlus: r.cPlus, cMinus: r.cMinus },
    { signalHigh: r.signalsHi, signalLow: r.signalsLo }).rows);
}

/**
 * Der Grund, warum nicht gerechnet wurde. Ein Fehlerobjekt eines `computed`
 * (`{ error }`, Wurf außerhalb der Engine) zählt als `errCompute`.
 * @param {Analysis|{ error: unknown }|null} analysis
 * @returns {Reason|null} null mit Ergebnis oder ohne Ausgabe
 */
export function errorOf(analysis) {
  if (!analysis) return null;
  if ('status' in analysis) return analysis.status === 'error' ? analysis.reason : null;
  return 'error' in analysis ? 'errCompute' : null;
}
