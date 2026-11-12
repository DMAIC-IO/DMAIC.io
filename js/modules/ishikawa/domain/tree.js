/**
 * D.Mike — Ishikawa: der Ursachenbaum als flache Zeilenliste.
 *
 * Jede Zeile trägt `id` und `parentId` (`null` für eine Hauptursache). Eine
 * Zeile, deren `parentId` auf keine vorhandene Zeile zeigt (Waise), gilt als
 * Wurzel. Geschwister stehen in der Reihenfolge der Liste. Reine Funktionen,
 * kein DOM.
 */

/**
 * @typedef {{ id: number, parentId: number|null }} TreeRow
 */

/**
 * Elternknoten einer Zeile; Waisen und Wurzeln liefern `null`.
 * @param {Set<number>} ids alle vorhandenen ids
 * @param {TreeRow} row @returns {number|null}
 */
function parentOf(ids, row) {
  return row.parentId !== null && ids.has(row.parentId) ? row.parentId : null;
}

/**
 * Kinder je Elternknoten (`null` = Wurzeln), in Listenreihenfolge.
 * @param {TreeRow[]} rows @returns {Map<number|null, TreeRow[]>}
 */
function childrenMap(rows) {
  const ids = new Set(rows.map((r) => r.id));
  const map = new Map();
  for (const row of rows) {
    const p = parentOf(ids, row);
    if (!map.has(p)) map.set(p, []);
    map.get(p).push(row);
  }
  return map;
}

/**
 * Zeilen in Baumreihenfolge: jede Zeile vor ihren Kindern, Geschwister in
 * Listenreihenfolge, Waisen unter den Wurzeln. Zeilen in einem Zyklus ohne
 * Wurzel fehlen.
 * @template {TreeRow} R
 * @param {R[]} rows @returns {R[]} dieselben Zeilenobjekte
 */
export function ordered(rows) {
  const kids = childrenMap(rows);
  const out = [];
  const seen = new Set();
  const walk = (pid) => {
    for (const row of kids.get(pid) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
      walk(row.id);
    }
  };
  walk(null);
  return out;
}

/**
 * Alle Nachkommen einer Zeile in Baumreihenfolge, ohne die Zeile selbst.
 * @param {TreeRow[]} rows @param {number} id
 * @returns {number[]} `[]` bei unbekannter id oder ohne Kinder
 */
export function subtreeIds(rows, id) {
  const kids = childrenMap(rows);
  const out = [];
  const seen = new Set([id]);
  const walk = (pid) => {
    for (const row of kids.get(pid) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row.id);
      walk(row.id);
    }
  };
  walk(id);
  return out;
}

/**
 * ids der Zeilen mit demselben Elternknoten, in Baumreihenfolge, die Zeile
 * selbst eingeschlossen.
 * @param {TreeRow[]} rows @param {number} id
 * @returns {number[]} `[]` bei unbekannter id
 */
export function siblingsOf(rows, id) {
  const row = rows.find((r) => r.id === id);
  if (!row) return [];
  const ids = new Set(rows.map((r) => r.id));
  const parent = parentOf(ids, row);
  return rows.filter((r) => parentOf(ids, r) === parent).map((r) => r.id);
}

/**
 * Tiefe einer Zeile: Wurzel 0, Kind 1, …; Waisen 0.
 * @param {TreeRow[]} rows @param {number} id @returns {number}
 */
export function depthOf(rows, id) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let depth = 0;
  const seen = new Set([id]);
  let p = byId.get(id)?.parentId ?? null;
  while (p !== null && byId.has(p) && !seen.has(p)) {
    seen.add(p);
    depth++;
    p = byId.get(p).parentId;
  }
  return depth;
}
