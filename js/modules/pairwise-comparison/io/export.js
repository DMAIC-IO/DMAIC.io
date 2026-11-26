/**
 * D.Mike — Paarweiser Vergleich, Export: die Matrix als Zeilen (für
 * `exports.table()`, CSV und XLSX) und die Auswertung als JSON-Wert (für
 * `exports.tree()`). Vor dem Ergebnis gibt es nichts zu exportieren.
 */
import { scores, resultsReachable } from '../domain/run.js';

/** @typedef {{ criteria: ReadonlyArray<string>, matrix: ReadonlyArray<ReadonlyArray<number>>, pairs: ReadonlyArray<unknown>, currentPair: number }} RunState */

/**
 * Kopf `['', …Kriterien, Summe]`, je Kriterium `[Name, …Zellen, Punkte]`;
 * die Diagonale ist `'-'`, Zellen und Punkte sind Zahlen. Ohne
 * abgeschlossenen Vergleich `null`.
 * @param {RunState} m @param {(key: string) => string} t Übersetzer des Moduls
 * @returns {(string|number)[][]|null}
 */
export function toRows(m, t) {
  if (!resultsReachable(m)) return null;
  const sc = scores(m.matrix);
  return [
    ['', ...m.criteria, t('sum')],
    ...m.criteria.map((name, i) => [
      name,
      ...m.criteria.map((_, j) => (i === j ? '-' : m.matrix[i][j])),
      sc[i],
    ]),
  ];
}

/**
 * Die Auswertung wie die Altdatei: Werkzeug, Zeitstempel, Kriterien, Matrix,
 * Punkte und Rangfolge mit Platz (Gleichstand in Eingabereihenfolge). Ohne
 * abgeschlossenen Vergleich `null`.
 * @param {RunState} m @param {string} nowIso Zeitstempel (ISO 8601)
 * @returns {object|null}
 */
export function toTree(m, nowIso) {
  if (!resultsReachable(m)) return null;
  const sc = scores(m.matrix);
  const ranking = m.criteria
    .map((name, i) => ({ name, score: sc[i], rank: 0 }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return {
    tool: 'pairwise-comparison',
    timestamp: nowIso,
    criteria: [...m.criteria],
    matrix: m.matrix.map((row) => [...row]),
    scores: sc,
    ranking,
  };
}
