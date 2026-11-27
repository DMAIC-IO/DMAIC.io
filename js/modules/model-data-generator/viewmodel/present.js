/**
 * D.Mike — Modelldaten-Generator: Anzeige.
 *
 * Reine Funktionen für Gleichung, Koeffizientengruppen, Kennzahlen und
 * Zeilenzähler in der App-Sprache. Keine Rechnung (die liegt in domain/),
 * kein DOM.
 */
import { formatNumber, decimalSeparator } from '../../../core/number-format.js';
import { factorLabel } from '../domain/sample.js';

/**
 * Eine Kennzahl mit vier Nachkommastellen, Beträge ab 10⁶ oder unter 0,001
 * (außer 0) in Exponentialschreibweise; Dezimalzeichen der Sprache.
 * @param {number|null} v @param {string} lang @returns {string}
 */
export function fmtStat(v, lang) {
  if (v === null || !Number.isFinite(v)) return formatNumber(v, lang);
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(4).replace('.', decimalSeparator(lang));
  return formatNumber(v, lang, { decimals: 4 });
}

/**
 * Eine Zahl der Gleichung oder eines Eingabefelds: ohne Gruppierung,
 * verlustfrei, mit dem Dezimalzeichen der Sprache.
 * @param {number} v @param {string} lang @returns {string}
 */
export function fmtPlain(v, lang) {
  return formatNumber(v, lang, { profile: 'input' });
}

/**
 * Der Schwanz der Gleichung: je Term mit β ≠ 0 ein Teil „ + β·A·B“ bzw.
 * „ − β·A“.
 * @param {ReadonlyArray<{ indices: number[], beta: number }>} terms
 * @param {ReadonlyArray<{ name: string }>} factors @param {string} lang
 * @returns {string[]}
 */
export function equationParts(terms, factors, lang) {
  return terms.filter((t) => t.beta !== 0).map((t) => {
    const vars = t.indices.map((fi) => factorLabel(factors, fi)).join('·');
    return ` ${t.beta > 0 ? '+' : '−'} ${fmtPlain(Math.abs(t.beta), lang)}·${vars}`;
  });
}

/**
 * Die Koeffizienten nach Ordnung gruppiert, in der Reihenfolge des ersten
 * Auftretens.
 * @param {ReadonlyArray<{ index: number, label: string, order: number, beta: number }>} terms
 * @param {(order: number) => string} groupLabel
 * @param {string} lang
 * @returns {{ label: string, items: { idx: number, label: string, value: string }[] }[]}
 */
export function betaGroups(terms, groupLabel, lang) {
  /** @type {Map<number, { idx: number, label: string, value: string }[]>} */
  const grouped = new Map();
  for (const t of terms) {
    if (!grouped.has(t.order)) grouped.set(t.order, []);
    grouped.get(t.order).push({ idx: t.index, label: t.label, value: fmtPlain(t.beta, lang) });
  }
  return [...grouped].map(([order, items]) => ({ label: groupLabel(order), items }));
}
