/**
 * D.Mike — Verlaufsdiagramm: die Rechnung als Zahlen (domain/analyze.js).
 *
 * Die Zahlen einer Spalte an die Engine `computeRunChart`, genau wie das
 * Altmodul sie aufrief: Median, Läufe um den Median, Läufe auf und ab und die
 * vier Lauftests. Rein: keine Übersetzung, keine Formatierung. Die Bewertung
 * gegen α (welcher Test anschlägt) rechnet nicht die Engine, sondern
 * `resultOf`/`flaggedCount`; ein α-Wechsel ruft die Engine darum nicht.
 */
import { computeRunChart } from '../../../engines/run-chart-engine.js';
import { finiteOrNull, zipPoints } from '../../../core/agent/agent-results.js';

/** Die vier Lauftests in der Reihenfolge der Testtafel. */
export const TEST_IDS = Object.freeze(['clustering', 'mixtures', 'trends', 'oscillation']);

/** Weniger Zahlen rechnet das Modul nicht. */
export const MIN_VALUES = 3;

/**
 * Das gerechnete Ergebnis, wie `read().result` es liefert.
 *
 * @typedef {object} Result
 * @property {number} n  verwertete Zahlen
 * @property {number|null} median  Median der Reihe
 * @property {number} runsAboutMedian  Läufe um den Median
 * @property {number} runsUpDown  Läufe auf und ab
 * @property {number} flagged  angeschlagene Tests, 0 bis 4
 * @property {RunTest[]} tests  die vier Lauftests
 */

/**
 * @typedef {object} RunTest
 * @property {'clustering'|'mixtures'|'trends'|'oscillation'} id  welcher Test
 * @property {number|null} p  p-Wert
 * @property {number} observed  gezählte Läufe, auf denen der Test beruht
 * @property {boolean} flagged  p kleiner als α
 */

/**
 * @typedef {object} Point
 * @property {number|null} value  der gezeichnete Wert
 */

/**
 * Ein Lauftest der Rechnung, vor der Bewertung gegen α.
 * @typedef {object} AnalysisTest
 * @property {'clustering'|'mixtures'|'trends'|'oscillation'} id
 * @property {number} p  p-Wert
 * @property {number} obs  gezählte Läufe
 */

/**
 * Das Rohergebnis für Anzeige und Diagramm (ohne Bewertung gegen α).
 * @typedef {object} Analysis
 * @property {number} median
 * @property {number} n
 * @property {number} runsAboutMedian
 * @property {number} runsUpDown
 * @property {number[]} values  die gezeichneten Werte in Datenfolge
 * @property {AnalysisTest[]} tests
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

/** @param {readonly any[]} a @param {readonly any[]} b @returns {boolean} */
const sameList = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Die letzte Eingabe und ihr Ergebnis. Ergebnis, Punkte, Ansicht und
 * Presenter rechnen je Änderung mit denselben Zahlen; so läuft die Engine nur
 * einmal.
 * @type {{ values: number[], analysis: Analysis|null }|null}
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
 * Rechnet Median, Läufe und die vier Lauftests. Unter drei Zahlen `null`.
 * Bei gleichen Zahlen wie beim letzten Aufruf (flach verglichen) kommt
 * dasselbe Ergebnisobjekt zurück; es wird nicht verändert.
 * @param {number[]} values
 * @returns {Analysis|null}
 */
export function analyze(values) {
  if (last && sameList(last.values, values)) return last.analysis;
  const analysis = compute(values);
  last = { values: [...values], analysis };
  return analysis;
}

/**
 * Die Rechnung selbst, ohne Zwischenspeicher.
 * @param {number[]} values
 * @returns {Analysis|null}
 */
function compute(values) {
  if (values.length < MIN_VALUES) return null;
  runs += 1;
  const r = computeRunChart(values);
  return {
    median: r.median,
    n: r.values.length,
    runsAboutMedian: r.runsAboutMedian,
    runsUpDown: r.runsUpDown,
    values: r.values,
    tests: [
      { id: 'clustering', p: r.pClustering, obs: r.runsAboutMedian },
      { id: 'mixtures', p: r.pMixtures, obs: r.runsAboutMedian },
      { id: 'trends', p: r.pTrends, obs: r.runsUpDown },
      { id: 'oscillation', p: r.pOscillation, obs: r.runsUpDown },
    ],
  };
}

/**
 * Ob ein Test bei diesem α anschlägt (p echt kleiner als α).
 * @param {number} p
 * @param {number} alpha
 * @returns {boolean}
 */
export function isFlagged(p, alpha) {
  return p < alpha;
}

/**
 * Wie viele der vier Tests bei diesem α anschlagen.
 * @param {Analysis|null} analysis
 * @param {number} alpha
 * @returns {number} 0 ohne Ergebnis
 */
export function flaggedCount(analysis, alpha) {
  if (!analysis) return 0;
  return analysis.tests.filter((t) => isFlagged(t.p, alpha)).length;
}

/**
 * Das Ergebnis für den Agenten in der Form der Altfläche.
 * @param {Analysis|null} analysis
 * @param {number} alpha
 * @returns {Result|null} null ohne Ergebnis
 */
export function resultOf(analysis, alpha) {
  if (!analysis) return null;
  return {
    n: analysis.n,
    median: finiteOrNull(analysis.median),
    runsAboutMedian: analysis.runsAboutMedian,
    runsUpDown: analysis.runsUpDown,
    flagged: flaggedCount(analysis, alpha),
    tests: analysis.tests.map((t) => ({
      id: t.id, p: finiteOrNull(t.p), observed: t.obs, flagged: isFlagged(t.p, alpha),
    })),
  };
}

/**
 * Je gezeichnetem Wert eine Zeile, in Datenfolge.
 * @param {Analysis|null} analysis
 * @returns {Point[]} leer ohne Ergebnis
 */
export function pointsOf(analysis) {
  if (!analysis) return [];
  return /** @type {Point[]} */ (zipPoints({ value: analysis.values }).rows);
}
