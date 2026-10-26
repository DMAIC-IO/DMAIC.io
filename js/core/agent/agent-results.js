/**
 * D.Mike — Gerechnete Zahlen für die Lesefläche (agent-results.js)
 *
 * Die Regelkarten geben ihr Ergebnis als rohe Zahlen in `read().result` und
 * je gezeichnetem Punkt eine Zeile in `read().points`.
 * JSON kennt weder NaN noch Infinity — beides wird hier `null`, an EINER
 * Stelle, statt in jedem Modul anders.
 *
 * Rein: kein DOM, kein `window`.
 */

/**
 * Eine Zahl für die Lesefläche: eine endliche Zahl bleibt, alles andere wird `null`.
 * @param {any} v
 * @returns {number|null}
 */
export function finiteOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Spaltenweise Reihen zu einer Zeile je Punkt zusammenlegen.
 *
 * Eine Spalte ist eine Liste (ein Wert je Punkt) oder ein Einzelwert, der für
 * jeden Punkt gilt (feste Grenzen neben punktweisen). Die Zeilenzahl ist die
 * Länge der längsten Liste; fehlt einer kürzeren Liste ein Punkt, steht dort
 * `null`. Ein Merkmal ist eine Liste von Punktindizes; jede Zeile bekommt
 * dafür `true` oder `false`.
 *
 * @param {Record<string, number|null|Array<number|null>>} columns Spaltenname → Werte
 * @param {Record<string, number[]>} [flags] Merkmalsname → Indizes der markierten Punkte
 * @returns {{ rows: object[], columns: string[] }} die Zeilen und alle Spaltennamen in Reihenfolge
 */
export function zipPoints(columns, flags = {}) {
  const names = Object.keys(columns);
  const flagNames = Object.keys(flags);
  let n = 0;
  for (const name of names) {
    if (Array.isArray(columns[name])) n = Math.max(n, columns[name].length);
  }
  const flagSets = Object.fromEntries(flagNames.map(f => [f, new Set(flags[f])]));
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const name of names) {
      const col = columns[name];
      row[name] = finiteOrNull(Array.isArray(col) ? col[i] : col);
    }
    for (const f of flagNames) row[f] = flagSets[f].has(i);
    rows.push(row);
  }
  return { rows, columns: [...names, ...flagNames] };
}
