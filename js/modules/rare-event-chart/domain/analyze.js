/**
 * D.Mike — Regelkarte seltener Ereignisse (g-Karte, t-Karte): die Rechnung als
 * Zahlen (domain/analyze.js).
 *
 * Die Zahlen der gewählten Spalte an die Engine (`computeGChart` bzw.
 * `computeTChart`), genau wie das Altmodul sie aufrief: alle echten Zahlen,
 * bei der t-Karte zählen für die Mindestzahl nur die positiven. Die g-Karte
 * zeichnet die Zählwerte, die t-Karte die transformierten Werte
 * y = t^(1/3,6) mit `null` an den Stellen nicht positiver Werte. Rein: keine
 * Übersetzung, keine Formatierung; Fehler sind Gründe (i18n-Schlüssel), keine
 * Texte. Die Altform rechnete synchron, darum `derived`; `analyze` merkt sich
 * die letzte Eingabe, damit alle Ableitungen und die Ansicht zusammen die
 * Engine einmal je Änderung rufen.
 */
import { computeGChart, computeTChart } from '../../../engines/rare-event-chart-engine.js';
import { finiteOrNull, zipPoints } from '../../../core/agent/agent-results.js';

/** Unter zwei verwertbaren Werten rechnet das Modul nicht (t: zwei positive). */
export const MIN_VALUES = 2;

/** Die Engine je Kartentyp (Schlüssel gleich dem Literal im Schema). */
export const ENGINES = Object.freeze({ g: computeGChart, t: computeTChart });

/**
 * Das gerechnete Ergebnis, wie `read().result` der Altform es lieferte. Bei
 * der t-Karte stehen cl, ucl und lcl auf der Originalskala, sigma auf der
 * transformierten.
 *
 * @typedef {object} Result
 * @property {'g'|'t'} chartType  Kartentyp
 * @property {number} n  verwertete Werte
 * @property {number|null} cl  Mittellinie, Originalskala
 * @property {number|null} ucl  obere Eingriffsgrenze, Originalskala
 * @property {number|null} lcl  untere Eingriffsgrenze, Originalskala
 * @property {number|null} sigma  Streuung; bei t transformiert
 * @property {boolean} transformed  gezeichnet auf transformierter Skala
 * @property {PlottedLimits} plotted  Grenzen auf der gezeichneten Skala
 * @property {number[]} signals  Punkte außerhalb der Grenzen
 */

/**
 * @typedef {object} PlottedLimits
 * @property {number|null} cl  Mittellinie
 * @property {number|null} ucl  obere Eingriffsgrenze
 * @property {number|null} lcl  untere Eingriffsgrenze
 * @property {number|null} sigma  Streuung
 */

/**
 * Ein gezeichneter Platz in Datenfolge.
 * @typedef {object} Point
 * @property {number|null} value  Wert auf der gezeichneten Skala; an den Lücken der t-Karte ohne Wert
 * @property {boolean} signal  außerhalb der Grenzen
 */

/**
 * Grund, warum nicht gerechnet wurde (i18n-Schlüssel des Moduls).
 * @typedef {'errCompute'} Reason
 */

/**
 * Das Rohergebnis der Engine.
 * @typedef {import('../../../engines/rare-event-chart-engine.js').GChartResult
 *   | import('../../../engines/rare-event-chart-engine.js').TChartResult} Fit
 */

/**
 * Was gezeichnet wird: die Werte (t-Karte mit `null` an den Lücken) und die
 * Grenzen auf der gezeichneten Skala.
 * @typedef {object} Plotted
 * @property {Array<number|null>} values
 * @property {number} cl
 * @property {number} ucl
 * @property {number} lcl
 * @property {number} sigma
 */

/**
 * Was an die Engine geht: der Typ und die verwerteten Werte (bei t auch die
 * nicht positiven, sie werden Lücken).
 * @typedef {object} Inputs
 * @property {'g'|'t'} type
 * @property {number[]} values
 */

/**
 * Was `analyze` liefert: Ergebnis oder Fehlergrund.
 * @typedef {{ status: 'ok', type: 'g'|'t', n: number, fit: Fit }
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
 * Was aus Werten und Model an die Engine geht. g: unter zwei Werten `null`;
 * t: unter zwei Werten über 0 `null` (die übrigen bleiben in der Liste und
 * werden Lücken). Ohne Werte `null`.
 * @param {number[]|null} values
 * @param {{ chartTypeId: 'g'|'t' }} model
 * @returns {Inputs|null}
 */
export function inputsOf(values, model) {
  if (!values) return null;
  const type = model.chartTypeId;
  const usable = type === 't' ? values.filter((v) => v > 0).length : values.length;
  if (usable < MIN_VALUES) return null;
  return { type, values };
}

/** @param {readonly number[]} a @param {readonly number[]} b @returns {boolean} */
function sameValues(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/** @param {Inputs|null} a @param {Inputs|null} b @returns {boolean} */
function sameInputs(a, b) {
  if (a === null || b === null) return a === b;
  return a.type === b.type && sameValues(a.values, b.values);
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

/**
 * Rechnet die Karte des gewählten Typs. `inputs` `null` (kein Bezug, zu
 * wenige Werte) → `null`: keine Ausgabe, kein Fehler. Bei gleicher Eingabe
 * (Typ, Werte flach verglichen) wie beim letzten Aufruf kommt dasselbe Objekt
 * zurück (auch Fehler und `null`); es wird nicht verändert.
 * @param {Inputs|null} inputs
 * @returns {Analysis|null}
 */
export function analyze(inputs) {
  if (last && sameInputs(last.inputs, inputs)) return last.analysis;
  const analysis = inputs ? analyzeWith(ENGINES[inputs.type], inputs) : null;
  last = { inputs: inputs && { ...inputs, values: [...inputs.values] }, analysis };
  return analysis;
}

/** @param {unknown} v @returns {boolean} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Die gezeichneten Zahlen aus dem Rohergebnis: g die Zählwerte, t die
 * transformierten Werte; Grenzen der gezeichneten Skala.
 * @param {'g'|'t'} type
 * @param {any} fit
 * @returns {Plotted}
 */
function plottedFrom(type, fit) {
  return {
    values: type === 't' ? fit.transformed : fit.values,
    cl: fit.cl, ucl: fit.ucl, lcl: fit.lcl, sigma: fit.sigma,
  };
}

/**
 * Die Rechnung selbst, ohne Merker, mit wählbarer Engine (Tests stubben sie,
 * um Würfe und nicht endliche Werte zu prüfen). Ein Wurf der Engine und ein
 * nicht endlicher gezeichneter Wert (cl, ucl, lcl, sigma der gezeichneten
 * Skala, jeder gezeichnete Wert außer den Lücken) werden zum Grund
 * `errCompute` (Ursache per `console.warn`). Nicht endliche Werte nur auf
 * der Originalskala der t-Karte sind kein Fehler.
 * @param {(values: number[]) => any} engine
 * @param {Inputs|null} inputs
 * @returns {Analysis|null}
 */
export function analyzeWith(engine, inputs) {
  if (inputs === null) return null;
  const { type, values } = inputs;
  runs += 1;
  /** @type {any} */
  let fit;
  try {
    fit = engine(values);
  } catch (e) {
    console.warn(`rare-event-chart: ${type}`, e);
    return { status: 'error', reason: 'errCompute' };
  }
  const p = fit && plottedFrom(type, fit);
  const ok = p && Array.isArray(p.values) && p.values.every((v) => v === null || finite(v))
    && finite(p.cl) && finite(p.ucl) && finite(p.lcl) && finite(p.sigma);
  if (!ok) {
    console.warn(`rare-event-chart: nicht endliche Werte (${type})`, p && { cl: p.cl, ucl: p.ucl, lcl: p.lcl, sigma: p.sigma });
    return { status: 'error', reason: 'errCompute' };
  }
  const n = type === 't' ? fit.transformed.filter((/** @type {unknown} */ v) => v !== null).length : values.length;
  return { status: 'ok', type, n, fit };
}

/**
 * Was gezeichnet wird; `null` ohne Ergebnis oder bei Fehler.
 * @param {Analysis|null} analysis
 * @returns {Plotted|null}
 */
export function plottedOf(analysis) {
  if (analysis?.status !== 'ok') return null;
  return plottedFrom(analysis.type, analysis.fit);
}

/**
 * Die Indizes der gezeichneten Plätze strikt außerhalb der gezeichneten
 * Grenzen; Lücken (`null`) zählen nicht. Eine Quelle für Diagramm, KPI und
 * `read()`.
 * @param {Analysis|null} analysis
 * @returns {number[]} leer ohne Ergebnis oder bei Fehler
 */
export function signalIndices(analysis) {
  const p = plottedOf(analysis);
  if (!p) return [];
  /** @type {number[]} */
  const out = [];
  p.values.forEach((v, i) => {
    if (v != null && (v > p.ucl || v < p.lcl)) out.push(i);
  });
  return out;
}

/**
 * Das Ergebnis in der Form von `read().result` der Altform; keine Funktionen,
 * Zahlen über `finiteOrNull` (bei t die Originalskala, `plotted` die
 * gezeichnete).
 * @param {Analysis|null} analysis
 * @returns {Result|null} null ohne Ergebnis oder bei Fehler
 */
export function resultOf(analysis) {
  if (analysis?.status !== 'ok') return null;
  const r = /** @type {any} */ (analysis.fit);
  const t = analysis.type === 't';
  return {
    chartType: analysis.type,
    n: analysis.n,
    cl: finiteOrNull(t ? r.clOriginal : r.cl),
    ucl: finiteOrNull(t ? r.uclOriginal : r.ucl),
    lcl: finiteOrNull(t ? r.lclOriginal : r.lcl),
    sigma: finiteOrNull(r.sigma),
    transformed: t,
    plotted: {
      cl: finiteOrNull(r.cl), ucl: finiteOrNull(r.ucl), lcl: finiteOrNull(r.lcl), sigma: finiteOrNull(r.sigma),
    },
    signals: signalIndices(analysis),
  };
}

/**
 * Je gezeichnetem Platz `{ value, signal }` in Datenfolge; `value` auf der
 * gezeichneten Skala, `null` an den Lücken der t-Karte.
 * @param {Analysis|null} analysis
 * @returns {Point[]} leer ohne Ergebnis oder bei Fehler
 */
export function pointsOf(analysis) {
  const p = plottedOf(analysis);
  if (!p) return [];
  return /** @type {Point[]} */ (zipPoints({ value: p.values }, { signal: signalIndices(analysis) }).rows);
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
