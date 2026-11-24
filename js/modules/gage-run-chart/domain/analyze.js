/**
 * D.Mike — Messverlaufsdiagramm: die Rechnung als Zahlen (domain/analyze.js).
 *
 * Die Rohwerte der Teile-, Prüfer- und Messwertspalte an die Engine
 * `computeGageRunChart`, genau wie das Altmodul sie aufrief: ein Feld je Teil,
 * darin eine Reihe je Prüfer, dazu Gesamtmittel, Spanne und Hinweise. Rein:
 * keine Übersetzung, keine Formatierung. Bezugswert, Teile je Streifen, die
 * Schalter und die Kopfzeile rechnet nicht die Engine; ein Wechsel dort ruft
 * sie darum nicht.
 */
import { computeGageRunChart, splitPanelRows } from '../../../engines/gage-run-chart-engine.js';
import { finiteOrNull } from '../../../core/agent/agent-results.js';

/**
 * Das gerechnete Ergebnis, wie `read().result` es liefert.
 *
 * @typedef {object} Result
 * @property {number} n  Messwerte
 * @property {number} droppedRows  verworfene Zeilen
 * @property {number} partCount  Teile
 * @property {number} operatorCount  Prüfer (0 ohne Prüferspalte)
 * @property {string[]} operators  Prüfer in Reihenfolge des ersten Auftretens
 * @property {boolean} hasOperators  Prüferspalte gesetzt
 * @property {number|null} grandMean  Gesamtmittel
 * @property {number|null} refValue  Bezugslinie
 * @property {number|null} yMin  kleinster Messwert
 * @property {number|null} yMax  größter Messwert
 * @property {string[]} warnings  Hinweise (`unbalanced`, `droppedRows`)
 * @property {CellMean[]} cellMeans  Mittelwert je Teil und Prüfer
 */

/**
 * @typedef {object} CellMean
 * @property {string} part  Teil
 * @property {string} operator  Prüfer ('' ohne Prüferspalte)
 * @property {number|null} mean  Mittelwert
 */

/**
 * @typedef {object} Point
 * @property {string} part  Teil
 * @property {string} operator  Prüfer ('' ohne Prüferspalte)
 * @property {number|null} value  Messwert
 */

/**
 * Die Rohwerte der drei Spalten, wie die Engine sie nimmt.
 * @typedef {object} InputColumns
 * @property {any[]} parts
 * @property {any[]|null} operators  `null` ohne Prüferspalte
 * @property {any[]} measurements
 */

/** @typedef {import('../../../engines/gage-run-chart-engine.js').GageRunChartResult} Analysis */
/** @typedef {import('../../../engines/gage-run-chart-engine.js').GageRunChartPanel} Panel */

/**
 * Die Rohwerte der gewählten Spalten in Zeilenfolge. `null`, wenn Teile- oder
 * Messwertspalte fehlt oder eine gesetzte Spalte (auch die Prüferspalte)
 * nicht lesbar ist: über eine gelöschte Spalte wird nicht gerechnet. Ohne
 * Prüferspalte `operators: null`.
 * @param {{ part: object|null, operator: object|null, measurement: object|null }} model
 * @param {{ values: (ref: object) => any[]|null }} read Spaltenleser (`sourceColumns`)
 * @returns {InputColumns|null}
 */
export function inputColumns(model, read) {
  if (!model.part || !model.measurement) return null;
  const parts = read.values(model.part);
  const measurements = read.values(model.measurement);
  if (!parts || !measurements) return null;
  let operators = null;
  if (model.operator) {
    operators = read.values(model.operator);
    if (!operators) return null;
  }
  return { parts, operators, measurements };
}

/** @param {readonly any[]} a @param {readonly any[]} b @returns {boolean} */
const sameList = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** @param {readonly any[]|null} a @param {readonly any[]|null} b @returns {boolean} */
const sameOptional = (a, b) => (a === null || b === null ? a === b : sameList(a, b));

/** @param {InputColumns} a @param {InputColumns} b @returns {boolean} */
const sameInput = (a, b) => sameList(a.parts, b.parts)
  && sameList(a.measurements, b.measurements)
  && sameOptional(a.operators, b.operators);

/**
 * Die letzte Eingabe und ihr Ergebnis. Ergebnis, Punkte, Ansicht und
 * Presenter rechnen je Änderung mit denselben Spalten; so läuft die Engine nur
 * einmal.
 * @type {{ cols: InputColumns, analysis: Analysis }|null}
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
 * Gruppiert die Messwerte je Teil und Prüfer. `null` ohne Eingabe. Bei
 * gleichen Spalten wie beim letzten Aufruf (flach verglichen) kommt dasselbe
 * Ergebnisobjekt zurück; es wird nicht verändert.
 * @param {InputColumns|null} cols
 * @returns {Analysis|null}
 */
export function analyze(cols) {
  if (!cols) return null;
  if (last && sameInput(last.cols, cols)) return last.analysis;
  runs += 1;
  const analysis = computeGageRunChart(cols);
  last = {
    cols: {
      parts: [...cols.parts],
      operators: cols.operators ? [...cols.operators] : null,
      measurements: [...cols.measurements],
    },
    analysis,
  };
  return analysis;
}

/**
 * Die Bezugslinie: der eingegebene Wert, wenn er eine endliche Zahl ist,
 * sonst (`null`) das Gesamtmittel.
 * @param {number|null} refValue
 * @param {number} grandMean
 * @returns {number}
 */
export function resolveRefValue(refValue, grandMean) {
  return typeof refValue === 'number' && Number.isFinite(refValue) ? refValue : grandMean;
}

/**
 * Die Felder je Streifen (je höchstens `partsPerRow` Teile). Leer ohne
 * Ergebnis oder ohne verwertbare Messwerte.
 * @param {Analysis|null} analysis
 * @param {number} partsPerRow
 * @returns {Panel[][]}
 */
export function stripRows(analysis, partsPerRow) {
  if (!analysis || analysis.n === 0) return [];
  return splitPanelRows(analysis.panels, partsPerRow);
}

/**
 * Gerechnet, aber kein verwertbarer Messwert (Grund für den Hinweis
 * „keine Daten“).
 * @param {Analysis|null} analysis
 * @returns {boolean}
 */
export function noDataOf(analysis) {
  return analysis !== null && analysis.n === 0;
}

/**
 * Das Ergebnis für den Agenten in der Form der Altfläche.
 * @param {Analysis|null} analysis
 * @param {{ refValue: number|null }} model
 * @returns {Result|null} null ohne Ergebnis und ohne verwertbare Messwerte
 */
export function resultOf(analysis, model) {
  if (!analysis || analysis.n === 0) return null;
  /** @type {CellMean[]} */
  const cellMeans = [];
  for (const panel of analysis.panels) {
    for (const s of panel.series) {
      cellMeans.push({ part: String(panel.part), operator: String(s.operator), mean: finiteOrNull(s.mean) });
    }
  }
  return {
    n: analysis.n,
    droppedRows: analysis.droppedRows,
    partCount: analysis.parts.length,
    operatorCount: analysis.hasOperators ? analysis.operators.length : 0,
    operators: analysis.operators.map(String),
    hasOperators: analysis.hasOperators,
    grandMean: finiteOrNull(analysis.grandMean),
    refValue: finiteOrNull(resolveRefValue(model.refValue, analysis.grandMean)),
    yMin: finiteOrNull(analysis.yMin),
    yMax: finiteOrNull(analysis.yMax),
    warnings: [...analysis.warnings],
    cellMeans,
  };
}

/**
 * Je Messwert eine Zeile, in Feldfolge (Teil, darin Prüfer, darin Zeilenfolge).
 * @param {Analysis|null} analysis
 * @returns {Point[]} leer ohne Ergebnis
 */
export function pointsOf(analysis) {
  if (!analysis) return [];
  /** @type {Point[]} */
  const out = [];
  for (const panel of analysis.panels) {
    for (const s of panel.series) {
      for (const v of s.values) out.push({ part: String(panel.part), operator: String(s.operator), value: finiteOrNull(v) });
    }
  }
  return out;
}
