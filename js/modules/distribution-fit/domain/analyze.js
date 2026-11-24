/**
 * D.Mike — Verteilungstest: die Rechnung als Zahlen (domain/analyze.js).
 *
 * Die Zahlen einer Spalte an die Engine `runDistributionFit`, genau wie das
 * Altmodul sie aufrief. Rein: keine Übersetzung, keine Formatierung; wo die
 * Rechnung nicht möglich ist, steht ein Grund. Den Text baut der Presenter.
 */
import { runDistributionFit } from '../../../engines/distribution-fit-engine.js';

/** Die Datentypen, in fester Reihenfolge der Knopfgruppe. */
export const DATA_TYPES = Object.freeze(['auto', 'continuous', 'discrete']);

/** Je Normalitätstest die Id im Algorithm Lab (nur validierte Verfahren). */
export const ALGO_LAB_IDS = Object.freeze({
  'Shapiro-Wilk': 'shapiro-wilk',
  'Anderson-Darling': 'anderson-darling',
  'Jarque-Bera': 'jarque-bera',
  "D'Agostino-Pearson": 'dagostino-pearson',
});

/** Weniger Zahlen rechnet das Modul nicht. */
export const MIN_VALUES = 5;

/**
 * Das gerechnete Ergebnis, wie `read().result` es liefert. Die Dichte- und
 * Verteilungsfunktionen der Engine fallen beim Lesen weg.
 *
 * @typedef {object} Result
 * @property {DescStats} stats  Kennwerte der Daten
 * @property {Fit[]} results  angepasste Verteilungen, beste zuerst
 * @property {NormalityTest[]} normalityTests  Normalitätstests
 * @property {'auto'|'continuous'|'discrete'} _dataType  Datentyp der Rechnung
 */

/**
 * @typedef {object} DescStats
 * @property {number} n  Anzahl
 * @property {number|null} mean  Mittelwert
 * @property {number|null} stdDev  Standardabweichung
 * @property {number|null} median  Median
 * @property {number|null} skewness  Schiefe
 * @property {number|null} kurtosis  Exzess-Wölbung
 * @property {number|null} min  Minimum
 * @property {number|null} max  Maximum
 */

/**
 * @typedef {object} Fit
 * @property {string} name  Verteilung
 * @property {'cont'|'disc'} type  stetig oder diskret
 * @property {Object<string, number>} params  geschätzte Parameter
 * @property {KsTest} [ks]  Kolmogorov-Smirnov, nur stetig
 * @property {ChiSquareTest} [chi2]  χ²-Anpassungstest, nur diskret
 * @property {number|null} score  p-Wert des Gütetests
 */

/**
 * @typedef {object} KsTest
 * @property {number|null} D  Statistik
 * @property {number|null} p  p-Wert
 */

/**
 * @typedef {object} ChiSquareTest
 * @property {number|null} chi2  Statistik
 * @property {number|null} df  Freiheitsgrade
 * @property {number|null} p  p-Wert
 */

/**
 * @typedef {object} NormalityTest
 * @property {string} name  Test
 * @property {number|null} p  p-Wert
 * @property {number|null} [W]  Shapiro-Wilk
 * @property {number|null} [A2]  Anderson-Darling, unkorrigiert
 * @property {number|null} [JB]  Jarque-Bera
 * @property {number|null} [K2]  D'Agostino-Pearson
 * @property {number|null} [skewness]  Schiefe
 * @property {number|null} [exKurtosis]  Exzess-Wölbung
 * @property {number|null} [skewZ]  z der Schiefe
 * @property {number|null} [kurtZ]  z der Wölbung
 * @property {boolean} [tooSmall]  zu wenige Werte
 */

/**
 * Die Rechnung samt Grund. `fit` ist das Rohergebnis der Engine (mit
 * `cdf`/`pdf`/`pmf` für das Diagramm), nur bei `status: 'ok'`.
 *
 * @typedef {{ status: 'ok', fit: any }
 *   | { status: 'insufficient', reason: 'min5' }
 *   | { status: 'error', reason: 'zeroVariance'|'error' }} Analysis
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
 * Die letzte Eingabe und ihr Ergebnis. Ergebnis, Ansicht und Presenter
 * rechnen je Änderung mit denselben Eingaben; so läuft die Engine nur einmal.
 * @type {{ values: number[], dataType: string, analysis: Analysis|null }|null}
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
 * Rechnet die Anpassung. Ohne Zahlen `null` (dann erscheint auch kein
 * Fehlerkasten; mit gesetzter, aber leerer Spalte zeigt die Ansicht den
 * Grund `min5`). Bei gleicher Eingabe wie beim letzten Aufruf (Zahlen flach
 * verglichen, Datentyp) kommt dasselbe Ergebnisobjekt zurück; es wird nicht
 * verändert.
 * @param {number[]} values
 * @param {string} dataType
 * @returns {Analysis|null}
 */
export function analyze(values, dataType) {
  if (last && last.dataType === dataType && sameList(last.values, values)) return last.analysis;
  const analysis = compute(values, dataType);
  last = { values: [...values], dataType, analysis };
  return analysis;
}

/**
 * Die Rechnung selbst, ohne Zwischenspeicher.
 * @param {number[]} values
 * @param {string} dataType
 * @returns {Analysis|null}
 */
function compute(values, dataType) {
  if (values.length === 0) return null;
  if (values.length < MIN_VALUES) return { status: 'insufficient', reason: 'min5' };
  runs += 1;
  try {
    return { status: 'ok', fit: runDistributionFit(values, /** @type {any} */ (dataType)) };
  } catch (err) {
    if (/** @type {any} */ (err)?.message === 'zeroVariance') return { status: 'error', reason: 'zeroVariance' };
    console.warn('[distribution-fit] Rechnung fehlgeschlagen:', err);
    return { status: 'error', reason: 'error' };
  }
}

/**
 * Das Ergebnis für den Agenten in der Form der Altfläche: das Rohergebnis
 * samt `_dataType`, ohne Funktionen (`cdf`/`pdf`/`pmf`), nicht endliche Zahlen
 * als `null` — wie nach dem JSON-Weg der alten Lesefläche.
 * @param {Analysis|null} analysis
 * @param {string} dataType
 * @returns {Result|null} null ohne gelungene Rechnung
 */
export function buildResult(analysis, dataType) {
  if (!analysis || analysis.status !== 'ok') return null;
  return JSON.parse(JSON.stringify({ ...analysis.fit, _dataType: dataType }));
}
