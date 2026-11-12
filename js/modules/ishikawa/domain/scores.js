/**
 * D.Mike — Ishikawa: Bewertung der Ursachen.
 *
 * Score einer Zeile = Mittel der abgegebenen Bewertungen (0–9) ihrer
 * Experten. Reine Funktionen, kein DOM, kein i18n.
 */
import { effCat } from './tree.js';

/**
 * @typedef {object} ScoredRow
 * @property {number} id
 * @property {string} stableId
 * @property {number|null} parentId
 * @property {string} category
 * @property {string} name
 * @property {Record<string, number>} ratings
 */

/** @typedef {import('./model.js').ParetoItem} ParetoItem */

/**
 * Eine Zeile im Vergleich mit einem Snapshot.
 *
 * @typedef {object} RowDiff
 * @property {string} stableId
 * @property {string} name
 * @property {number} before  score in the snapshot, 0 without one
 * @property {number} after  score now, 0 without one
 * @property {number} delta  after − before
 */

/**
 * Mittel der abgegebenen Bewertungen; ohne Bewertung `null`.
 * @param {{ ratings: Record<string, number> }} row @returns {number|null}
 */
export function scoreOf(row) {
  const v = Object.values(row.ratings ?? {}).filter((x) => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * Anzeigename: der getrimmte Name, sonst die stableId.
 * @param {{ name: string, stableId: string }} row @returns {string}
 */
function displayName(row) {
  const n = (row.name ?? '').trim();
  return n || row.stableId;
}

/**
 * Die bewerteten Zeilen absteigend nach Score (gleiche Scores in
 * Listenreihenfolge); Zeilen ohne Bewertung entfallen.
 * @param {ReadonlyArray<ScoredRow>} rows @returns {ParetoItem[]}
 */
export function paretoItems(rows) {
  const out = [];
  for (const r of rows) {
    const score = scoreOf(r);
    if (score === null) continue;
    out.push({ stableId: r.stableId, name: displayName(r), category: effCat(/** @type {any} */ (rows), r), score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Zeilen, deren Score sich gegenüber den Snapshot-Zeilen um mehr als 0,01
 * geändert hat (über die stableId gepaart; fehlender Score zählt als 0), in
 * Listenreihenfolge der aktuellen Zeilen.
 * @param {ReadonlyArray<ScoredRow>} rows aktuelle Zeilen
 * @param {ReadonlyArray<ScoredRow>} snapRows Zeilen des Snapshots
 * @returns {RowDiff[]}
 */
export function diffRows(rows, snapRows) {
  const before = new Map(snapRows.filter((r) => r.stableId).map((r) => [r.stableId, r]));
  const out = [];
  for (const r of rows) {
    const old = r.stableId ? before.get(r.stableId) : undefined;
    if (!old) continue;
    const b = scoreOf(old) || 0;
    const a = scoreOf(r) || 0;
    if (Math.abs(b - a) > 0.01) out.push({ stableId: r.stableId, name: displayName(r), before: b, after: a, delta: a - b });
  }
  return out;
}

/**
 * Vergleich der aktuellen Zeilen mit den Zeilen eines Snapshots.
 * @typedef {object} SnapshotDiff
 * @property {string[]} added stableIds, die im Snapshot fehlen
 * @property {string[]} removed stableIds, die es nicht mehr gibt
 * @property {RowDiff[]} changed Zeilen mit geändertem Score (`diffRows`)
 */

/**
 * Neue, entfernte und im Score geänderte Zeilen gegenüber einem Snapshot.
 * @param {ReadonlyArray<ScoredRow>} rows aktuelle Zeilen
 * @param {ReadonlyArray<ScoredRow>} snapRows Zeilen des Snapshots
 * @returns {SnapshotDiff}
 */
export function compareRows(rows, snapRows) {
  const now = new Set(rows.map((r) => r.stableId));
  const then = new Set(snapRows.map((r) => r.stableId));
  return {
    added: rows.filter((r) => !then.has(r.stableId)).map((r) => r.stableId),
    removed: snapRows.filter((r) => !now.has(r.stableId)).map((r) => r.stableId),
    changed: diffRows(rows, snapRows),
  };
}
