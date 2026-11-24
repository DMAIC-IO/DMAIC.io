/**
 * D.Mike — Kurzserien-Regelkarte (Z-MR): die Rechnung als Zahlen
 * (domain/analyze.js).
 *
 * Messwert- und Teilespalte werden zeilenweise gepaart, genau wie das
 * Altmodul sie an `computeZMR` gab: bis zur kürzeren Spalte, nur Paare mit
 * einer echten Zahl und einem gesetzten Teil. Die Engine standardisiert je
 * Teil (z-Werte) und rechnet die MR-Karte der z-Werte. Rein: keine
 * Übersetzung, keine Formatierung; Fehler sind Gründe (i18n-Schlüssel), keine
 * Texte. Die Altform rechnete synchron, darum `derived`; `analyze` merkt sich
 * die letzte Eingabe, damit alle Ableitungen und die Ansicht zusammen die
 * Engine einmal je Änderung rufen.
 */
import { computeZMR } from '../../../engines/short-run-chart-engine.js';
import { finiteOrNull, zipPoints } from '../../../core/agent/agent-results.js';

/** Unter vier verwertbaren Paaren rechnet das Modul nicht. */
export const MIN_PAIRS = 4;

/**
 * Das gerechnete Ergebnis, wie `read().result` der Altform es lieferte. Die
 * Indizes zählen die verwerteten Paare, nicht die Zeilen.
 *
 * @typedef {object} Result
 * @property {number} n  verwertete Paare
 * @property {number} skipped  Werte aus Teilen ohne Streuung
 * @property {GroupStats[]} groups  je Teil, in Reihenfolge des Auftretens
 * @property {Limits} z  Grenzen der z-Karte
 * @property {Limits} mr  Grenzen der MR-Karte der z-Werte
 * @property {number[]} signalsZ  Signale der z-Karte
 * @property {number[]} signalsMR  Signale der MR-Karte
 */

/**
 * @typedef {object} GroupStats
 * @property {string} group  Teil (immer Text, auch bei Zahlen)
 * @property {number} count  Werte des Teils
 * @property {number|null} mean  Mittelwert des Teils
 * @property {number|null} sigma  geschätzte Streuung des Teils
 * @property {number|null} mrBar  mittlere gleitende Spannweite des Teils
 */

/**
 * @typedef {object} Limits
 * @property {number|null} cl  Mittellinie
 * @property {number|null} ucl  obere Eingriffsgrenze
 * @property {number|null} lcl  untere Eingriffsgrenze
 */

/**
 * Ein verwertetes Paar in Datenfolge.
 * @typedef {object} Point
 * @property {number|null} z  standardisierter Wert
 * @property {number|null} mr  gleitende Spannweite der z-Werte; in der ersten Zeile ohne Wert
 * @property {boolean} signalZ  Signal der z-Karte
 * @property {boolean} signalMR  Signal der MR-Karte
 */

/**
 * Grund, warum nicht gerechnet wurde (i18n-Schlüssel des Moduls).
 * @typedef {'errCompute'} Reason
 */

/**
 * Das Rohergebnis der Engine.
 * @typedef {import('../../../engines/short-run-chart-engine.js').ZMRResult} Fit
 */

/**
 * Was an die Engine geht: die verwerteten Paare, gleich lang.
 * @typedef {object} Inputs
 * @property {number[]} values  Messwerte in Datenfolge
 * @property {Array<string|number>} groups  Teil je Messwert
 */

/**
 * Was `analyze` liefert: Ergebnis oder Fehlergrund.
 * @typedef {{ status: 'ok', n: number, fit: Fit }
 *   | { status: 'error', reason: Reason }} Analysis
 */

/**
 * Die Paare aus Messwert und Teil, wie das Altmodul sie bildete: zeilenweise
 * bis zur kürzeren Spalte; ein Paar zählt nur mit einer echten Zahl (kein
 * `NaN`, kein Text wie „2,5“, kein `null`) und einem Teil, das weder fehlt
 * noch leer ist. Ohne einen der beiden Bezüge `null`, ebenso, wenn eine der
 * Spalten nicht lesbar ist (gelöscht).
 * @param {{ valuesRef: object|null, groupsRef: object|null }} model
 * @param {{ values: (ref: object) => any[]|null }} read Spaltenleser (`sourceColumns`)
 * @returns {Inputs|null}
 */
export function inputPairs(model, read) {
  const { valuesRef, groupsRef } = model;
  if (!valuesRef || !groupsRef) return null;
  const rawValues = read.values(valuesRef);
  const rawGroups = read.values(groupsRef);
  if (!Array.isArray(rawValues) || !Array.isArray(rawGroups)) return null;
  const len = Math.min(rawValues.length, rawGroups.length);
  /** @type {number[]} */
  const values = [];
  /** @type {Array<string|number>} */
  const groups = [];
  for (let i = 0; i < len; i++) {
    const v = rawValues[i];
    const g = rawGroups[i];
    if (typeof v === 'number' && !Number.isNaN(v) && g != null && g !== '') {
      values.push(v);
      groups.push(g);
    }
  }
  return { values, groups };
}

/**
 * Was an die Engine geht: ohne Paare oder unter vier Paaren `null` (leere
 * Ausgabe ohne Meldung), sonst die Paare.
 * @param {Inputs|null} pairs
 * @returns {Inputs|null}
 */
export function inputsOf(pairs) {
  if (!pairs || pairs.values.length < MIN_PAIRS) return null;
  return pairs;
}

/** @param {readonly unknown[]} a @param {readonly unknown[]} b @returns {boolean} */
function sameList(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/** @param {Inputs|null} a @param {Inputs|null} b @returns {boolean} */
function sameInputs(a, b) {
  if (a === null || b === null) return a === b;
  return sameList(a.values, b.values) && sameList(a.groups, b.groups);
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
 * Rechnet die Z-MR-Karte. `inputs` `null` (ein Bezug fehlt, zu wenige Paare)
 * → `null`: keine Ausgabe, kein Fehler. Bei gleicher Eingabe (Werte und
 * Teile flach verglichen) wie beim letzten Aufruf kommt dasselbe Objekt
 * zurück (auch Fehler und `null`); es wird nicht verändert.
 * @param {Inputs|null} inputs
 * @returns {Analysis|null}
 */
export function analyze(inputs) {
  if (last && sameInputs(last.inputs, inputs)) return last.analysis;
  const analysis = analyzeWith(computeZMR, inputs);
  last = { inputs: inputs && { values: [...inputs.values], groups: [...inputs.groups] }, analysis };
  return analysis;
}

/** @param {unknown} v @returns {boolean} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Ob alle gezeichneten Zahlen endlich sind: jedes z, jede gleitende
 * Spannweite außer der führenden Lücke, Mittellinie und Grenzen der
 * MR-Karte.
 * @param {any} fit
 * @returns {boolean}
 */
function plottable(fit) {
  return !!fit && Array.isArray(fit.z) && Array.isArray(fit.mr)
    && fit.z.every(finite)
    && fit.mr.every((/** @type {unknown} */ v, /** @type {number} */ i) => (i === 0 ? v === null : finite(v)))
    && finite(fit.mrBarZ) && finite(fit.uclMR) && finite(fit.lclMR);
}

/**
 * Die Rechnung selbst, ohne Merker, mit wählbarer Engine (Tests stubben sie,
 * um Würfe und nicht endliche Werte zu prüfen). Ein Wurf der Engine und ein
 * nicht endlicher gezeichneter Wert (jedes z, jedes MR außer der führenden
 * Lücke, MR̄ der z-Werte, UCL und LCL der MR-Karte) werden zum Grund
 * `errCompute` (Ursache per `console.warn`). Nicht endliche Kennzahlen nur
 * eines Teils (Mittelwert, σ̂, MR̄) sind kein Fehler.
 * @param {(values: number[], groups: Array<string|number>) => any} engine
 * @param {Inputs|null} inputs
 * @returns {Analysis|null}
 */
export function analyzeWith(engine, inputs) {
  if (inputs === null) return null;
  const { values, groups } = inputs;
  runs += 1;
  /** @type {any} */
  let fit;
  try {
    fit = engine(values, groups);
  } catch (e) {
    console.warn('short-run-chart: Rechnung fehlgeschlagen', e);
    return { status: 'error', reason: 'errCompute' };
  }
  if (!plottable(fit)) {
    console.warn('short-run-chart: nicht endliche Werte', fit && { mrBarZ: fit.mrBarZ, uclMR: fit.uclMR, lclMR: fit.lclMR });
    return { status: 'error', reason: 'errCompute' };
  }
  return { status: 'ok', n: values.length, fit };
}

/**
 * Die Trennlinien zwischen den Teilen: die kumulierten Teilegrößen in
 * Reihenfolge des ersten Auftretens, ohne die letzte (wie die Altform). Bei
 * Teilen, die später wiederkommen, liegen sie nach Stückzahl, nicht am
 * Wechsel.
 * @param {Fit|null|undefined} fit
 * @returns {number[]} leer ohne Ergebnis
 */
export function stageBoundariesOf(fit) {
  if (!fit) return [];
  /** @type {number[]} */
  const out = [];
  let cumulative = 0;
  for (let i = 0; i < fit.groups.length - 1; i++) {
    cumulative += fit.groups[i].count;
    out.push(cumulative);
  }
  return out;
}

/**
 * Das Ergebnis in der Form von `read().result` der Altform; keine Funktionen,
 * Zahlen über `finiteOrNull`, das Teil als Text.
 * @param {Analysis|null} analysis
 * @returns {Result|null} null ohne Ergebnis oder bei Fehler
 */
export function resultOf(analysis) {
  if (analysis?.status !== 'ok') return null;
  const r = analysis.fit;
  return {
    n: analysis.n,
    skipped: r.skipped,
    groups: r.groups.map((g) => ({
      group: String(g.group),
      count: g.count,
      mean: finiteOrNull(g.mean),
      sigma: finiteOrNull(g.sigma),
      mrBar: finiteOrNull(g.mrBar),
    })),
    z: { cl: finiteOrNull(r.clZ), ucl: finiteOrNull(r.uclZ), lcl: finiteOrNull(r.lclZ) },
    mr: { cl: finiteOrNull(r.mrBarZ), ucl: finiteOrNull(r.uclMR), lcl: finiteOrNull(r.lclMR) },
    signalsZ: [...r.signalsZ],
    signalsMR: [...r.signalsMR],
  };
}

/**
 * Je verwertetem Paar `{ z, mr, signalZ, signalMR }` in Datenfolge; `mr` in
 * der ersten Zeile `null`.
 * @param {Analysis|null} analysis
 * @returns {Point[]} leer ohne Ergebnis oder bei Fehler
 */
export function pointsOf(analysis) {
  if (analysis?.status !== 'ok') return [];
  const r = analysis.fit;
  return /** @type {Point[]} */ (zipPoints({ z: r.z, mr: r.mr }, { signalZ: r.signalsZ, signalMR: r.signalsMR }).rows);
}

/**
 * Wie viele Werte aus Teilen ohne Streuung als z = 0 gezählt wurden.
 * @param {Analysis|null} analysis
 * @returns {number} 0 ohne Ergebnis oder bei Fehler
 */
export function skippedOf(analysis) {
  return analysis?.status === 'ok' ? analysis.fit.skipped : 0;
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
