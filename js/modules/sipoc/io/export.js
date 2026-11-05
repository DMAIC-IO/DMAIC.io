/**
 * D.Mike — SIPOC: Exportinhalte. Reine Funktionen; den Download
 * (export-utils.js) löst das Viewmodel aus.
 */
import { COLUMNS } from '../domain/summary.js';

export const FILE_NAMES = Object.freeze({ json: 'sipoc.json', csv: 'sipoc.csv', xlsx: 'sipoc.xlsx', png: 'sipoc.png', svg: 'sipoc.svg' });

/** @param {{ columns: Record<string, string[]> }} state @returns {number} */
const rowCount = (state) => Math.max(...COLUMNS.map((c) => state.columns[c.key].length), 1);

/**
 * @param {{ columns: Record<string, string[]> }} state @param {Date} [now]
 * @returns {string}
 */
export function toJSONExport(state, now = new Date()) {
  const sipoc = {};
  for (const { key } of COLUMNS) sipoc[key] = [...state.columns[key]];
  return JSON.stringify({ tool: 'SIPOC', timestamp: now.toISOString(), sipoc }, null, 2);
}

/**
 * Kopfzeile plus Einträge, Zeile für Zeile über alle Spalten.
 * @param {{ columns: Record<string, string[]> }} state @param {(key: string) => string} t
 * @returns {string[][]}
 */
export function toRows(state, t) {
  const rows = [COLUMNS.map((c) => t(`col.${c.key}`))];
  for (let i = 0; i < rowCount(state); i++) rows.push(COLUMNS.map((c) => state.columns[c.key][i] || ''));
  return rows;
}

/**
 * @param {{ columns: Record<string, string[]> }} state @param {(key: string) => string} t
 * @returns {string}
 */
export function toCSV(state, t) {
  const quote = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return `sep=;\n${toRows(state, t).map((row) => row.map(quote).join(';')).join('\n')}\n`;
}

/**
 * Spalten für die Bildexporte (export-utils.js exportColumnsAs*).
 * @param {{ columns: Record<string, string[]> }} state @param {(key: string) => string} t
 * @param {Record<string, string>} colors Farbe je Spaltenschlüssel (aus den CSS-Variablen)
 * @returns {{ title: string, desc: string, color: string, items: string[] }[]}
 */
export function toImageColumns(state, t, colors) {
  return COLUMNS.map((c) => ({
    title: t(`col.${c.key}`).toUpperCase(),
    desc: t(`colDesc.${c.key}`),
    color: colors[c.key] ?? '',
    items: [...state.columns[c.key]],
  }));
}
