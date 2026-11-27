/**
 * D.Mike — MSA Typ 4: Spalten paaren und rechnen, als reine Funktionen.
 *
 * Die Engine liefert mit `regression.ciBand` eine Funktion (Konfidenzband der
 * Geraden). Lesefläche und Ansicht brauchen dasselbe Ergebnis: ein Merker für
 * den letzten Stand sorgt dafür, dass die Engine je Eingabe einmal rechnet und
 * das Band für den Linearitätsplot erreichbar bleibt.
 */
import { analyze } from '../../../engines/msa-typ4-engine.js';
import { columnValues } from '../../../core/source-columns.js';
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/** Stützstellen des Konfidenzbands minus eins (das Band hat 41 Punkte). */
export const BAND_STEPS = 40;

/** @typedef {{ instanceId: string, sheetId?: string, columnId: string }} ColumnRef */

/**
 * Die zeilengleich gepaarten Spalten.
 *
 * @typedef {object} Inputs
 * @property {number[]} reference  Referenzwerte
 * @property {number[]} measured  Messwerte derselben Zeilen
 */

/**
 * @typedef {object} StudyParams
 * @property {'AIAG'|'VDA5'} norm
 * @property {'tolerance'|'sixSigma'} pvMode
 * @property {{ LSL: number|null, USL: number|null }} tolerance
 * @property {number|null} sigmaP
 * @property {number} alpha
 */

/**
 * Ein Zellwert als Zahl: Zahlen bleiben, Text über `parseDecimalInput`
 * („2,5“ und „1.234,5“ zählen); Wahrheitswerte, Leeres und Unlesbares nicht.
 * @param {unknown} v @returns {number|null}
 */
function cellNumber(v) {
  if (typeof v === 'boolean' || v == null) return null;
  const n = typeof v === 'number' ? v : parseDecimalInput(/** @type {any} */ (v));
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Beide Spalten lesen und Zeile für Zeile bis zur kürzeren paaren; eine Zeile
 * entfällt, wenn einer ihrer Werte keine Zahl ist. `null` ohne eine der
 * Spalten oder ohne ein Paar.
 * @param {{ refColumn: ColumnRef|null, measColumn: ColumnRef|null }} m
 * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
 * @returns {Inputs|null}
 */
export function readInputs(m, src) {
  if (!m.refColumn || !m.measColumn) return null;
  const rawRef = columnValues(src, /** @type {any} */ (m.refColumn)) ?? [];
  const rawMeas = columnValues(src, /** @type {any} */ (m.measColumn)) ?? [];
  /** @type {number[]} */
  const reference = [];
  /** @type {number[]} */
  const measured = [];
  const len = Math.min(rawRef.length, rawMeas.length);
  for (let i = 0; i < len; i++) {
    const r = cellNumber(rawRef[i]);
    const v = cellNumber(rawMeas[i]);
    if (r === null || v === null) continue;
    reference.push(r);
    measured.push(v);
  }
  return reference.length ? { reference, measured } : null;
}

/**
 * Die Parameter der Engine; leere Grenzen und ein leeres σP gehen als `NaN`.
 * @param {StudyParams} p
 * @returns {{ pvMode: string, LSL: number, USL: number, sigmaP: number, alpha: number, norm: string }}
 */
export function engineParams(p) {
  const nan = (/** @type {number|null} */ v) => (v == null ? NaN : v);
  return {
    pvMode: p.pvMode,
    LSL: nan(p.tolerance.LSL),
    USL: nan(p.tolerance.USL),
    sigmaP: nan(p.sigmaP),
    alpha: p.alpha,
    norm: p.norm,
  };
}

/** @type {{ key: string, run: any }|null} */
let memo = null;

/**
 * Die Engine rechnen lassen: `null` ohne Eingaben, sonst ihr Ergebnis samt
 * `regression.ciBand` (oder `{ ok: false, errorKey, errorVars }`). Der letzte
 * Stand wird gemerkt; dieselben Eingaben rechnen nicht noch einmal.
 * @param {StudyParams} p
 * @param {Inputs|null} inputs
 * @returns {any}
 */
export function runEngine(p, inputs) {
  if (!inputs) return null;
  const params = engineParams(p);
  const key = JSON.stringify([inputs.reference, inputs.measured, params]);
  if (memo?.key === key) return memo.run;
  const run = analyze(inputs.reference, inputs.measured, params);
  memo = { key, run };
  return run;
}

/**
 * Kopie ohne Funktionen; nicht endliche Zahlen werden `null`.
 * @param {unknown} v @returns {any}
 */
function plain(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (typeof x !== 'function') out[k] = plain(x);
    }
    return out;
  }
  return v;
}

/**
 * Das Ergebnis für Lesefläche und Ansicht: ohne Lauf `null`, bei einer
 * Ablehnung der Engine `{ invalid: { key, vars } }`, sonst eine Kopie ohne
 * `regression.ciBand`, nicht endliche Zahlen als `null`.
 * @param {any} run Ergebnis von `runEngine`
 * @returns {any}
 */
export function toResult(run) {
  if (!run) return null;
  if (!run.ok) return { invalid: { key: run.errorKey, vars: run.errorVars ?? null } };
  return plain(run);
}

/**
 * Regressionsgerade und Konfidenzband über den Bereich der Referenzwerte, 41
 * Stützstellen; das Band als Abstände nach oben und unten (nie negativ).
 * `null` ohne gelungenen Lauf.
 * @param {any} run Ergebnis von `runEngine`
 * @param {Inputs|null} inputs
 * @returns {{ x: number[], y: number[], yPlus: number[], yMinus: number[] }|null}
 */
export function bandPoints(run, inputs) {
  if (!run?.ok || !inputs || !inputs.reference.length) return null;
  const { slope, intercept, ciBand } = run.regression;
  const xMin = Math.min(...inputs.reference);
  const xMax = Math.max(...inputs.reference);
  const x = new Array(BAND_STEPS + 1);
  const y = new Array(BAND_STEPS + 1);
  const yPlus = new Array(BAND_STEPS + 1);
  const yMinus = new Array(BAND_STEPS + 1);
  for (let i = 0; i <= BAND_STEPS; i++) {
    const xv = xMin + (xMax - xMin) * (i / BAND_STEPS);
    const yhat = slope * xv + intercept;
    const [lo, hi] = ciBand(xv);
    x[i] = xv;
    y[i] = yhat;
    yPlus[i] = Math.max(0, hi - yhat);
    yMinus[i] = Math.max(0, yhat - lo);
  }
  return { x, y, yPlus, yMinus };
}
