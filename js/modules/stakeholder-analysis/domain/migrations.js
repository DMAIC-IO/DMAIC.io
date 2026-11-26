/**
 * D.Mike — Stakeholder-Analyse: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration
 * nicht). Jeder Schritt liefert ein einfaches Objekt.
 */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {string} */
const textOr = (v) => (typeof v === 'string' ? v : '');

/**
 * Eine Stufe 1–5 wie die Altform: ganzzahliger Anteil, auf 1–5 geklemmt;
 * was keine Zahl ergibt, wird 3.
 * @param {unknown} v @returns {number}
 */
function level(v) {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (Beispiele, alte Exporte). Nur die
 * Form: `stakeholders` ist eine Liste oder leer, die Einträge bleiben
 * unverändert; der folgende Schritt normalisiert sie.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {{ stakeholders: unknown[] }}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  return { stakeholders: Array.isArray(o.stakeholders) ? o.stakeholders : [] };
}

/**
 * '1.0→1.1': die Einträge so, wie das alte `Stakeholder.fromJSON` sie las.
 * Was kein Objekt ist (auch eine Liste), entfällt. Texte bleiben, sonst `''`;
 * `power`/`interest` wie oben; `support`/`category` behalten jeden
 * nichtleeren Text wörtlich, sonst `neutral`/`intern`; fremde Schlüssel
 * entfallen. Vorhandene nichtleere ids bleiben. Fehlt die id, wird sie fest
 * `s<Position>` (ab 1), damit ein nie gespeicherter Stand bei jedem Lesen
 * dieselbe id zeigt; eine spätere doppelte id und eine Ersatz-id, die schon
 * vergeben ist, bekommen `_` angehängt, bis sie frei sind.
 * @param {unknown} old gespeicherter Zustand '1.0' (ohne `_schema`)
 * @returns {{ stakeholders: { id: string, name: string, role: string, power: number, interest: number, support: string, category: string, notes: string }[] }}
 */
export function from1_0(old) {
  const o = isObject(old) ? old : {};
  const list = Array.isArray(o.stakeholders) ? o.stakeholders : [];
  const taken = new Set(list.filter(isObject).map((d) => d.id).filter((id) => typeof id === 'string' && id !== ''));
  const used = new Set();
  const stakeholders = [];
  list.forEach((d, i) => {
    if (!isObject(d)) return;
    const own = typeof d.id === 'string' && d.id !== '' ? d.id : null;
    let id = own;
    if (id === null || used.has(id)) {
      id = own ?? `s${i + 1}`;
      while (used.has(id) || taken.has(id)) id += '_';
      taken.add(id);
    }
    used.add(id);
    stakeholders.push({
      id,
      name: textOr(d.name),
      role: textOr(d.role),
      power: level(d.power),
      interest: level(d.interest),
      support: typeof d.support === 'string' && d.support ? d.support : 'neutral',
      category: typeof d.category === 'string' && d.category ? d.category : 'intern',
      notes: textOr(d.notes),
    });
  });
  return { stakeholders };
}
