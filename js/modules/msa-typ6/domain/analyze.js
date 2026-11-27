/**
 * D.Mike — MSA Typ 6: Eingaben lesen und rechnen, als reine Funktionen.
 */
import { validate, analyze } from '../../../engines/msa-typ6-engine.js';
import { columnValues } from '../../../core/source-columns.js';
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/**
 * Die zeilengleich gepaarten Spalten: Messwerte als Zahlen, dazu Zeitstempel
 * und Untergruppe derselben Zeile. Zeilen ohne lesbaren Messwert entfallen
 * samt Zeitstempel und Untergruppe (Text wie „2,5“ zählt, Wahrheitswerte nicht).
 *
 * @typedef {object} Inputs
 * @property {number[]} values  Messwerte
 * @property {any[]|null} timestamps  Zeitstempel je Messwert, ohne Spalte null
 * @property {any[]|null} subgroups  Untergruppe je Messwert, ohne Spalte null
 */

/** @typedef {{ instanceId: string, sheetId?: string, columnId: string }} ColumnRef */

/**
 * Die Spalten lesen und zeilengleich paaren; `null` ohne Messwertspalte oder
 * ohne einen lesbaren Messwert.
 * @param {{ columns: { timestamp: ColumnRef|null, value: ColumnRef|null, subgroup: ColumnRef|null } }} m
 * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
 * @returns {Inputs|null}
 */
export function readInputs(m, src) {
  const c = m.columns;
  if (!c.value) return null;
  const rawValues = columnValues(src, /** @type {any} */ (c.value)) ?? [];
  const rawTimestamps = c.timestamp ? (columnValues(src, /** @type {any} */ (c.timestamp)) ?? []) : null;
  const rawSubgroups = c.subgroup ? (columnValues(src, /** @type {any} */ (c.subgroup)) ?? []) : null;
  /** @type {number[]} */
  const values = [];
  const timestamps = rawTimestamps ? [] : null;
  const subgroups = rawSubgroups ? [] : null;
  for (let i = 0; i < rawValues.length; i++) {
    const v = rawValues[i];
    if (typeof v === 'boolean') continue;
    const n = parseDecimalInput(v);
    if (typeof n !== 'number' || !Number.isFinite(n)) continue;
    values.push(n);
    if (timestamps && rawTimestamps) timestamps.push(rawTimestamps[i] ?? null);
    if (subgroups && rawSubgroups) subgroups.push(rawSubgroups[i] ?? null);
  }
  return values.length ? { values, timestamps, subgroups } : null;
}

/**
 * @typedef {object} StudyParams
 * @property {'i-mr'|'xbar-r'} chartType
 * @property {'from-study'|'given'} limitsMode
 * @property {number} baselineK
 * @property {number|null} mu0
 * @property {number|null} sigma0
 * @property {number[]} enabledRules
 * @property {number} alpha
 */

/**
 * Die Eingabe der Engine aus Parametern und gepaarten Spalten.
 * @param {StudyParams} p
 * @param {Inputs} inputs
 * @returns {object}
 */
export function engineInputs(p, inputs) {
  return {
    chartType: p.chartType,
    values: inputs.values,
    subgroups: p.chartType === 'xbar-r' ? inputs.subgroups : null,
    timestamps: inputs.timestamps,
    limitsMode: p.limitsMode,
    baselineK: p.baselineK,
    mu0: p.mu0 == null ? NaN : p.mu0,
    sigma0: p.sigma0 == null ? NaN : p.sigma0,
    enabledRules: [...p.enabledRules],
    alpha: p.alpha,
  };
}

/**
 * Die Studie rechnen: ohne Eingaben `null`, bei abgelehnten Eingaben
 * `{ invalid: { code, params } }` mit dem Fehlercode der Engine (fehlt σ₀ bei
 * vorgegebenen Grenzen: `E_SIGMA0_MISSING`), sonst das Ergebnis der Engine.
 * @param {StudyParams} p
 * @param {Inputs|null} inputs
 * @returns {any}
 */
export function analyzeTyp6(p, inputs) {
  if (!inputs) return null;
  const engine = engineInputs(p, inputs);
  const v = /** @type {{ ok: boolean, code?: string, params?: object }} */ (validate(engine));
  if (!v.ok) {
    // Fehlt σ₀ bei vorgegebenen Grenzen, sagt ein eigener Code, was zu tun ist.
    const code = v.code === 'E_GIVEN_LIMITS_INVALID' && p.sigma0 == null ? 'E_SIGMA0_MISSING' : v.code;
    return { invalid: { code, params: v.params ?? null } };
  }
  try {
    return analyze(engine);
  } catch (/** @type {any} */ e) {
    if (e && typeof e.code === 'string') return { invalid: { code: e.code, params: e.params ?? null } };
    throw e;
  }
}

/**
 * Die Zeitachse der Driftgrafik: bei gleich langer Zeitstempelreihe (nur bei
 * I-MR, eine Zeile je Punkt) die Zeitstempel als Zahl (Text über
 * `Date.parse`), sonst die laufende Nummer ab 1.
 * @param {Inputs|null} inputs
 * @param {number} n Punkte der Lagekarte
 * @returns {number[]}
 */
export function driftAxis(inputs, n) {
  const ts = inputs?.timestamps;
  if (Array.isArray(ts) && ts.length === n) {
    return ts.map((v) => (typeof v === 'string' ? Date.parse(v) : Number(v)));
  }
  return Array.from({ length: n }, (_, i) => i + 1);
}
