/**
 * D.Mike — SIPOC: Spalten mit Buchstaben und Kurzüberblick für die Kachel.
 */
import { COL_KEYS } from './model.js';

const LETTERS = { suppliers: 'S', inputs: 'I', process: 'P', outputs: 'O', customers: 'C' };

/** @type {{ key: string, letter: string }[]} in COL_KEYS-Reihenfolge */
export const COLUMNS = COL_KEYS.map((key) => ({ key, letter: LETTERS[key] }));

/**
 * Je Spalte Anzahl und die ersten `n` Einträge. `n` unter 1 oder keine Zahl zählt als 1.
 * @param {{ columns: Record<string, string[]> }} state
 * @param {number} n
 * @returns {{ key: string, letter: string, count: number, top: string[], more: number }[]}
 */
export function columnSummary(state, n) {
  const k = Math.max(1, Math.floor(Number(n)) || 1);
  return COLUMNS.map(({ key, letter }) => {
    const items = state.columns[key];
    const top = items.slice(0, k);
    return { key, letter, count: items.length, top, more: items.length - top.length };
  });
}
