/**
 * D.Mike — Multi-Vari Export: Tabelle der Varianzkomponenten als Zeilen
 * (für `exports.table()`) und als CSV-Text.
 */

import { totalPercentValue } from '../domain/analysis.js';

/**
 * Zeilen der Varianzkomponenten-Tabelle: Kopf, Terme, Summe. Nicht endliche
 * Zahlen werden zu leeren Zellen.
 * @param {{terms: Array<object>, totalVariance: number}} vc
 * @param {{head: string[], total: string, termLabel: (term: object) => string}} labels
 * @returns {string[][]}
 */
export function vcTable(vc, { head, total, termLabel }) {
  const cell = (v) => (Number.isFinite(v) ? String(v) : '');
  const rows = [[...head]];
  for (const t of vc.terms) {
    rows.push([termLabel(t), cell(t.df), cell(t.ss), cell(t.ms), cell(t.variance), cell(t.sd), cell(t.percent)]);
  }
  rows.push([total, '', '', '', cell(vc.totalVariance),
    cell(Math.sqrt(vc.totalVariance)), cell(totalPercentValue(vc))]);
  return rows;
}

/**
 * CSV-Text der Tabelle — dieselben Spalten wie die Bildschirmtabelle, Punkt
 * als Dezimaltrenner, Zeilenbeschriftungen in Anführungszeichen.
 * @param {{terms: Array<object>, totalVariance: number}} vc
 * @param {string[]} head — 7 übersetzte Spaltenköpfe
 * @param {string} totalLabel
 * @param {(term: object) => string} termLabelFn
 * @returns {string}
 */
export function vcCsvText(vc, head, totalLabel, termLabelFn) {
  const rows = vcTable(vc, { head, total: totalLabel, termLabel: termLabelFn });
  const quote = (s) => `"${s.replace(/"/g, '""')}"`;
  return rows.map((r, i) => (i === 0 ? r : [quote(r[0]), ...r.slice(1)]).join(',')).join('\n');
}
