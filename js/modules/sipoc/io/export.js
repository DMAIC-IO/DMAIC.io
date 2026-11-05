/**
 * D.Mike — SIPOC: Exportinhalte. Reine Funktionen; Dateien und Download
 * baut der Kern (core/exporter.js) aus den Mappern im Viewmodel.
 */
import { COLUMNS } from '../domain/summary.js';

/** @param {{ columns: Record<string, string[]> }} state @returns {number} */
const rowCount = (state) => Math.max(...COLUMNS.map((c) => state.columns[c.key].length), 1);

/**
 * @param {{ columns: Record<string, string[]> }} state @param {Date} [now]
 * @returns {{ tool: string, timestamp: string, sipoc: Record<string, string[]> }}
 */
export function toJSONObject(state, now = new Date()) {
  /** @type {Record<string, string[]>} */
  const sipoc = {};
  for (const { key } of COLUMNS) sipoc[key] = [...state.columns[key]];
  return { tool: 'SIPOC', timestamp: now.toISOString(), sipoc };
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
 * Spalten für das Bild (export-utils.js columnsToSVG).
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
