/**
 * D.Mike — MSA Typ 1: Messwerte lesen und rechnen, als reine Funktionen.
 */
import { validate, analyze, mean, stddev } from '../../../engines/msa-typ1-engine.js';
import { columnValues, numericValues } from '../../../core/source-columns.js';

/**
 * Die numerischen Werte der Messwertspalte; leer ohne Spalte oder bei
 * unlesbarer Spalte. Text wie „2,5“ zählt, Leerwerte und Text fallen heraus.
 * @param {{ columnRef: object|null }} m
 * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
 * @returns {number[]}
 */
export function readValues(m, src) {
  if (!m.columnRef) return [];
  return numericValues(columnValues(src, /** @type {any} */ (m.columnRef)) ?? []);
}

/**
 * Die Studie rechnen: ohne Werte `null`, bei abgelehnten Eingaben
 * `{ invalid: { key, vars } }`, sonst das Ergebnis der Engine. Leere Grenzen
 * und ein leerer Referenzwert gehen als `NaN` an die Engine.
 * @param {{ ref: number|null, lsl: number|null, usl: number|null, k1: number, k2: number }} p
 * @param {number[]} values
 * @returns {any}
 */
export function analyzeTyp1(p, values) {
  if (!values.length) return null;
  const nan = (/** @type {number|null} */ v) => (v == null ? NaN : v);
  const opts = { ref: nan(p.ref), lsl: nan(p.lsl), usl: nan(p.usl) };
  const v = validate(opts, values);
  if (!v.valid) return { invalid: { key: v.errorKey, vars: v.errorVars || null } };
  return analyze({ ...opts, k1: p.k1, k2: p.k2 }, values);
}

/**
 * Anzahl, Mittelwert und Standardabweichung der Werte; `null` unter 2 Werten.
 * @param {number[]} values
 * @returns {{ n: number, mean: number, stdDev: number }|null}
 */
export function columnStatsOf(values) {
  if (values.length < 2) return null;
  return { n: values.length, mean: mean(values), stdDev: stddev(values) };
}
