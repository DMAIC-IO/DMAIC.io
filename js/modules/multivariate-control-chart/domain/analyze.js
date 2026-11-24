/**
 * D.Mike — Multivariate Regelkarte (Hotelling T²): die Rechnung als Zahlen
 * (domain/analyze.js).
 *
 * Die vollständigen Zeilen der gewählten Spalten an die Engine
 * `computeHotellingT2`, genau wie das Altmodul sie aufrief: Phase I über die
 * ersten `baselineCount` Zeilen (nur wenn größer als die Zahl der Variablen,
 * sonst alle), Phase-II-Grenze aus der F-Verteilung. Rein: keine Übersetzung,
 * keine Formatierung; Fehler sind Gründe (i18n-Schlüssel), keine Texte. Die
 * Rechnung ist billig (Median 3,7 ms bei n = 10 000 und p = 10), darum
 * `derived`; `analyze` merkt sich die letzte Eingabe, damit alle Ableitungen
 * und die Ansicht zusammen die Engine einmal je Änderung rufen.
 */
import { computeHotellingT2 } from '../../../engines/multivariate-chart-engine.js';
import { finiteOrNull, zipPoints } from '../../../core/agent/agent-results.js';

/** Unter zwei Variablen rechnet das Modul nicht. */
export const MIN_VARIABLES = 2;

/** Die Codes, mit denen die Engine wirft; jeder hat den Grund `err_<code>`. */
export const ENGINE_ERROR_CODES = Object.freeze(['singular', 'tooFewObservations', 'tooFewVariables', 'rowLengthMismatch', 'baselineTooSmall']);

/**
 * Das gerechnete Ergebnis, wie `read().result` der Altform es lieferte.
 * Die Signalindizes zählen die vollständigen Zeilen, nicht die Zeilen des
 * Arbeitsblatts.
 *
 * @typedef {object} Result
 * @property {number} n  vollständige Zeilen
 * @property {number} p  Variablen
 * @property {number} m  Zeilen der Phase I
 * @property {number|null} cl  Mittellinie der T²-Karte
 * @property {number|null} ucl  obere Eingriffsgrenze der T²-Karte
 * @property {Array<number|null>} mean  Mittelwert je Variable, Phase I
 * @property {Array<Array<number|null>>} covariance  Kovarianzmatrix, Phase I
 * @property {number[]} signals  Zeilen über der Grenze
 */

/**
 * Eine vollständige Zeile in Datenfolge.
 * @typedef {object} Point
 * @property {number|null} t2  der T²-Wert der Zeile
 * @property {boolean} signal  über der oberen Eingriffsgrenze
 */

/**
 * Grund, warum nicht gerechnet wurde (i18n-Schlüssel des Moduls).
 * @typedef {'errTooFewRows'|'err_singular'|'err_tooFewObservations'|'err_tooFewVariables'
 *   |'err_rowLengthMismatch'|'err_baselineTooSmall'|'errCompute'} Reason
 */

/**
 * Das Rohergebnis der Engine.
 * @typedef {import('../../../engines/multivariate-chart-engine.js').HotellingT2Result} Fit
 */

/**
 * Was `analyze` liefert: Ergebnis oder Fehlergrund (`p` nur bei
 * `errTooFewRows`, der Text setzt es ein).
 * @typedef {{ status: 'ok', fit: Fit, n: number }
 *   | { status: 'error', reason: Reason, p?: number }} Analysis
 */

/**
 * Was an die Engine geht.
 * @typedef {object} AnalyzeOptions
 * @property {number} alpha  Fehlalarmrate der Grenze
 * @property {number|undefined} baselineEnd  Zeilen der Phase I, `undefined` für alle
 * @property {number} p  Zahl der Variablen (gewählte Bezüge)
 */

/**
 * Die Datenmatrix: je vollständiger Zeile die Werte aller gewählten Spalten,
 * wie das Altmodul sie baute. Gezählt wird bis zur kürzesten Spalte; eine
 * Zeile zählt nur, wenn jede Spalte dort eine echte Zahl hat (kein `NaN`,
 * kein Text wie „2,5“). Unter zwei Bezügen `null`, ebenso, wenn eine Spalte
 * nicht lesbar ist (gelöscht): dann wird nicht über die übrigen gerechnet.
 * @param {{ columnRefs: readonly object[] }} model
 * @param {{ values: (ref: object) => any[]|null }} read Spaltenleser (`sourceColumns`)
 * @returns {number[][]|null}
 */
export function inputRows(model, read) {
  const refs = model.columnRefs;
  if (!Array.isArray(refs) || refs.length < MIN_VARIABLES) return null;
  const cols = [];
  for (const ref of refs) {
    const values = read.values(ref);
    if (!Array.isArray(values)) return null;
    cols.push(values);
  }
  const len = Math.min(...cols.map((c) => c.length));
  const rows = [];
  for (let i = 0; i < len; i++) {
    const row = cols.map((c) => c[i]);
    if (row.every((v) => typeof v === 'number' && !Number.isNaN(v))) rows.push(row);
  }
  return rows;
}

/**
 * Die Länge der Phase I, die an die Engine geht: `baselineCount`, wenn größer
 * als die Zahl der Variablen, sonst `undefined` (alle Zeilen; wie die Altform).
 * @param {{ columnRefs: readonly object[], baselineCount: number|null }} model
 * @returns {number|undefined}
 */
export function baselineEndOf(model) {
  const p = model.columnRefs.length;
  return model.baselineCount && model.baselineCount > p ? model.baselineCount : undefined;
}

/**
 * Was aus dem Model an die Engine geht: α, die wirksame Phase-I-Länge und p.
 * @param {{ columnRefs: readonly object[], alpha: number, baselineCount: number|null }} model
 * @returns {AnalyzeOptions}
 */
export function optionsOf(model) {
  return { alpha: model.alpha, baselineEnd: baselineEndOf(model), p: model.columnRefs.length };
}

/** @param {readonly number[][]} a @param {readonly number[][]} b @returns {boolean} */
function sameRows(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.length !== y.length) return false;
    for (let j = 0; j < x.length; j++) if (!Object.is(x[j], y[j])) return false;
  }
  return true;
}

/**
 * Die letzte Eingabe und ihr Ergebnis.
 * @type {{ rows: number[][]|null, alpha: number, baselineEnd: number|undefined, p: number, analysis: Analysis|null }|null}
 */
let last = null;

/** Wie oft die Engine gelaufen ist (Zählung für Tests und Messung). */
let runs = 0;

/**
 * Wie oft die Engine bisher aufgerufen wurde. Nur zum Zählen in Tests und
 * Messungen; der Wert steigt nur, wenn wirklich gerechnet wird.
 * @returns {number}
 */
export function engineRuns() { return runs; }

/**
 * Rechnet die T²-Karte. `rows` `null` (unter zwei Variablen, Spalte nicht
 * lesbar) → `null`: keine Ausgabe, kein Fehler. Bei gleichen Zeilen (flach
 * verglichen), gleichem α, gleicher Phase-I-Länge und gleichem p wie beim
 * letzten Aufruf kommt dasselbe Objekt zurück (auch Fehler und `null`); es
 * wird nicht verändert.
 * @param {number[][]|null} rows
 * @param {AnalyzeOptions} options
 * @returns {Analysis|null}
 */
export function analyze(rows, { alpha, baselineEnd, p }) {
  if (last && Object.is(last.alpha, alpha) && Object.is(last.baselineEnd, baselineEnd) && last.p === p
    && (last.rows === null || rows === null ? last.rows === rows : sameRows(last.rows, rows))) {
    return last.analysis;
  }
  const analysis = analyzeWith(computeHotellingT2, rows, { alpha, baselineEnd, p });
  last = { rows: rows && rows.map((r) => [...r]), alpha, baselineEnd, p, analysis };
  return analysis;
}

/** @param {unknown} v @returns {boolean} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Die Rechnung selbst, ohne Merker, mit wählbarer Engine (Tests stubben sie,
 * um Würfe und nicht endliche Werte zu prüfen).
 * @param {typeof computeHotellingT2} engine
 * @param {number[][]|null} rows
 * @param {AnalyzeOptions} options
 * @returns {Analysis|null}
 */
export function analyzeWith(engine, rows, { alpha, baselineEnd, p }) {
  if (rows === null) return null;
  if (rows.length <= p) return { status: 'error', reason: 'errTooFewRows', p };
  runs += 1;
  /** @type {Fit} */
  let fit;
  try {
    fit = engine(rows, { alpha, baselineEnd });
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    if (ENGINE_ERROR_CODES.includes(code)) return { status: 'error', reason: /** @type {Reason} */ (`err_${code}`) };
    console.warn('multivariate-control-chart: computeHotellingT2', e);
    return { status: 'error', reason: 'errCompute' };
  }
  if (!fit.t2.every(finite) || !finite(fit.cl) || !finite(fit.ucl)) {
    console.warn('multivariate-control-chart: nicht endliche T²-Werte oder Grenzen', { cl: fit.cl, ucl: fit.ucl });
    return { status: 'error', reason: 'errCompute' };
  }
  return { status: 'ok', fit, n: rows.length };
}

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
    p: r.p,
    m: r.m,
    cl: finiteOrNull(r.cl),
    ucl: finiteOrNull(r.ucl),
    mean: r.mean.map(finiteOrNull),
    covariance: r.cov.map((row) => row.map(finiteOrNull)),
    signals: [...r.signals],
  };
}

/**
 * Je vollständiger Zeile eine Zeile in Datenfolge.
 * @param {Analysis|null} analysis
 * @returns {Point[]} leer ohne Ergebnis oder bei Fehler
 */
export function pointsOf(analysis) {
  if (analysis?.status !== 'ok') return [];
  return /** @type {Point[]} */ (zipPoints({ t2: analysis.fit.t2 }, { signal: analysis.fit.signals }).rows);
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
