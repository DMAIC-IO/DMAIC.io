/**
 * D.Mike — Multi-Vari Export: Tabelle der Varianzkomponenten als Zeilen
 * (für `exports.table()`); der Exporter macht daraus CSV und XLSX.
 */

import { totalPercentValue } from '../domain/analysis.js';

/**
 * Zeilen der Varianzkomponenten-Tabelle: Kopf, Terme, Summe. Nicht endliche
 * Zahlen werden zu leeren Zellen.
 * @param {{terms: Array<object>, totalVariance: number}} vc
 * @param {{head: string[], total: string, termLabel: (term: object) => string}} labels
 * @returns {Array<Array<string|number>>}
 */
export function vcTable(vc, { head, total, termLabel }) {
  const cell = (v) => (Number.isFinite(v) ? v : '');
  const rows = [[...head]];
  for (const t of vc.terms) {
    rows.push([termLabel(t), cell(t.df), cell(t.ss), cell(t.ms), cell(t.variance), cell(t.sd), cell(t.percent)]);
  }
  rows.push([total, '', '', '', cell(vc.totalVariance),
    cell(Math.sqrt(vc.totalVariance)), cell(totalPercentValue(vc))]);
  return rows;
}
