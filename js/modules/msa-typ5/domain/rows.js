/**
 * D.Mike — MSA Typ 5: Zeilen der Analyse aus den Spalten (reine Funktionen).
 */
import { stackWide } from '../../../engines/msa-typ5-engine.js';
import { blank } from './levels.js';
import { refToKey } from '../../../core/worksheet-columns.js';

/**
 * Eine Zeile der Analyse.
 * @typedef {{ part: string, appraiser: string, value: string, rep: number|null }} Row
 */

/**
 * Referenz je Teil aus Teile- und Referenzspalte (die letzte nicht leere gewinnt).
 * @param {Array<*>} parts @param {Array<*>} refs @returns {Record<string,string>}
 */
function referenceMapOf(parts, refs) {
  /** @type {Record<string,string>} */
  const map = {};
  for (let i = 0; i < parts.length; i++) {
    if (blank(parts[i]) || blank(refs[i])) continue;
    map[String(parts[i])] = String(refs[i]);
  }
  return map;
}

/**
 * Langes Layout: eine Zeile je Bewertung. Leere Teile, Prüfer oder Bewertungen
 * werden zeilenweise übersprungen. Null, wenn eine Pflichtspalte fehlt.
 * @param {{ parts: Array<*>|null, appraisers: Array<*>|null, ratings: Array<*>|null,
 *           references: Array<*>|null, replicates: Array<*>|null }} cols Werte je Spalte
 * @returns {{ rows: Row[], referenceMap: Record<string,string> }|null}
 */
export function longRows({ parts, appraisers, ratings, references, replicates }) {
  if (!parts || !appraisers || !ratings) return null;
  const n = Math.min(parts.length, appraisers.length, ratings.length);
  const rows = [];
  /** @type {Record<string,string>} */
  const referenceMap = {};
  for (let i = 0; i < n; i++) {
    if (blank(parts[i]) || blank(appraisers[i]) || blank(ratings[i])) continue;
    const row = { part: String(parts[i]), appraiser: String(appraisers[i]), value: String(ratings[i]), rep: null };
    if (replicates && !blank(replicates[i])) {
      const r = Number(replicates[i]);
      row.rep = Number.isFinite(r) ? r : (i + 1);
    }
    rows.push(row);
    if (references && !blank(references[i])) referenceMap[String(parts[i])] = String(references[i]);
  }
  return { rows, referenceMap };
}

/**
 * Bezüge in der Reihenfolge der Spalten des Blatts (die Mehrfachauswahl liefert
 * die Klickreihenfolge).
 * @template {{ instanceId: string, sheetId?: string, columnId: string }} R
 * @param {R[]} refs
 * @param {string[]} sheetKeys Schlüssel (`refToKey`) der Blattspalten in Blattreihenfolge
 * @returns {R[]}
 */
export function orderRatings(refs, sheetKeys) {
  const pos = (ref) => sheetKeys.indexOf(refToKey(ref));
  return [...refs].sort((a, b) => pos(a) - pos(b));
}

/**
 * Breites Layout: je Prüfer und Versuch eine Bewertungsspalte, gruppiert nach
 * Versuchen. Null ohne Teilespalte oder Bewertungsspalten; `invalid` mit
 * Meldungsschlüssel, wenn die Versuche nicht zur Spaltenzahl passen. Ungültige
 * Versuche lehnt schon das Feld ab; kämen sie doch an, gilt dieselbe Meldung.
 * @param {{ parts: Array<*>|null, columns: Array<{ name: string, values: Array<*> }>,
 *           trials: number, references: Array<*>|null }} input Spalten in Blattreihenfolge
 * @returns {{ rows: Row[], referenceMap: Record<string,string> }
 *   |{ invalid: { key: 'errWideColumnsNotDivisible', vars: { columns: number, trials: number } } }|null}
 */
export function wideRows({ parts, columns, trials, references }) {
  if (!parts || columns.length === 0) return null;
  const { rows, error } = stackWide({ parts, columns, trials });
  if (error) return { invalid: { key: 'errWideColumnsNotDivisible', vars: { columns: columns.length, trials } } };
  return { rows, referenceMap: references ? referenceMapOf(parts, references) : {} };
}
