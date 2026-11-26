/**
 * D.Mike — RACI-Matrix: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder check.js (das Schema darf sich ändern, die
 * Migration nicht).
 */

/** Rollen im Formatstand 1.0. */
const ROLES_1_0 = ['R', 'A', 'C', 'I'];

/** Zellschlüssel der Altform: `zeile:spalte`, Nummern ab 0 ohne führende Null. */
const LEGACY_KEY = /^(0|[1-9]\d*):(0|[1-9]\d*)$/;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Eine Altliste von Namen → Einträge mit fester id aus der Position. Ein Text
 * bleibt wörtlich (auch leer), eine Zahl wird ihr Text, alles andere entfällt.
 * @param {unknown} list @param {string} prefix `a` oder `s`
 * @returns {{ items: { id: string, name: string }[], ids: Map<number, string> }}
 *   `ids`: Position in der Altliste → neue id (nur übernommene Einträge)
 */
function entries(list, prefix) {
  const items = [];
  const ids = new Map();
  if (!Array.isArray(list)) return { items, ids };
  list.forEach((v, i) => {
    if (typeof v !== 'string' && typeof v !== 'number') return;
    const id = `${prefix}${i + 1}`;
    items.push({ id, name: String(v) });
    ids.set(i, id);
  });
  return { items, ids };
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (wie ihn das alte `State.toJSON`
 * schrieb, von Hand oder als Beispieldatei). Aktivitäten und Beteiligte werden
 * Objekte mit fester id aus der Position (`a1`, `a2`, … bzw. `s1`, `s2`, …),
 * damit ein nie gespeicherter Stand bei jedem Lesen dieselben ids zeigt. Die
 * Rollen ziehen von `zeile:spalte` auf `<aktivität>:<stakeholder>` um; nur
 * Schlüssel dieser Form mit beiden Positionen auf übernommenen Einträgen und
 * dem Wert R, A, C oder I bleiben, in der Reihenfolge der Quelle. Fremde
 * Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {{ activities: { id: string, name: string }[], stakeholders: { id: string, name: string }[], assignments: Record<string, string> }}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  const acts = entries(o.activities, 'a');
  const shs = entries(o.stakeholders, 's');
  /** @type {Record<string, string>} */
  const assignments = {};
  if (isObject(o.assignments)) {
    for (const [key, role] of Object.entries(o.assignments)) {
      const hit = LEGACY_KEY.exec(key);
      if (!hit || !ROLES_1_0.includes(role)) continue;
      const a = acts.ids.get(Number(hit[1]));
      const s = shs.ids.get(Number(hit[2]));
      if (a === undefined || s === undefined) continue;
      assignments[`${a}:${s}`] = role;
    }
  }
  return { activities: acts.items, stakeholders: shs.items, assignments };
}
