/**
 * D.Mike — Zufallsgenerator, Export: die erzeugten Werte als eine Spalte
 * `Value` (für `exports.table()`, CSV und XLSX) und der Dateiname wie in der
 * Altform. Ohne Werte gibt es nichts zu exportieren.
 */
import { roundTo } from '../../../core/number-format.js';
import { ATTRIBUTIVE_KEY, distOf } from '../domain/distributions.js';
import { effectiveSeed } from '../domain/sample.js';

/**
 * Kopf `['Value']`, je Wert eine Zeile: stetig auf 8 Nachkommastellen
 * gerundet, diskret ganz, attributiv der Kategoriename. Ohne Werte `null`.
 * @param {string|null} currentDist @param {ReadonlyArray<number|string>} values
 * @returns {(string|number)[][]|null}
 */
export function toRows(currentDist, values) {
  if (!values.length) return null;
  const discrete = currentDist === ATTRIBUTIVE_KEY || Boolean(distOf(currentDist)?.discrete);
  return [['Value'], ...values.map((v) => [discrete || typeof v !== 'number' ? v : roundTo(v, 8)])];
}

/**
 * Dateiname ohne Endung: `<verteilung>_seed<startwert>_n<anzahl>`; der
 * Startwert ist der wirksame (leer 42).
 * @param {{ currentDist: string|null, seed: number|null, attrSeed: number|null }} m
 * @param {number} n Zahl der Werte
 * @returns {string}
 */
export function fileNameOf(m, n) {
  const seed = effectiveSeed(m.currentDist === ATTRIBUTIVE_KEY ? m.attrSeed : m.seed);
  return `${m.currentDist ?? 'random-generator'}_seed${seed}_n${n}`;
}
