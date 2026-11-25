/**
 * D.Mike — TRIZ-Evolutionstrends: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder trends.js (das Schema darf sich ändern, die
 * Migration nicht).
 */

/**
 * Trends im Formatstand 1.0 mit ihrer Stufenzahl, in gespeicherter Reihenfolge.
 * @type {ReadonlyArray<[string, number]>}
 */
const TRENDS_1_0 = [
  ['aggregation', 4], ['dynamism', 5], ['scale', 4], ['automation', 4],
  ['completeness', 4], ['controllability', 4], ['matching', 4], ['uneven', 0],
];

/**
 * @param {unknown} v @returns {Record<string, unknown>|null} das Objekt oder null
 */
function asObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? /** @type {Record<string, unknown>} */ (v) : null;
}

/**
 * '0→1.0': Altstände ohne `_schema` (Beispieldatei, von Hand). `system` als
 * Text oder leer; je bekanntem Trend die Stufe als Zahl, wenn ganzzahlig in
 * `[-1, Stufen − 1]`, sonst -1, und die Notiz als Text oder leer. Fehlende
 * Trends bekommen die Vorgabe, fremde entfallen.
 * @param {unknown} old gespeicherter Zustand der Altform
 * @returns {{ system: string, trends: Record<string, { stage: number, notes: string }> }}
 */
export function from0(old) {
  const o = asObject(old) ?? {};
  const inTrends = asObject(o.trends) ?? {};
  /** @type {Record<string, { stage: number, notes: string }>} */
  const trends = {};
  for (const [id, stages] of TRENDS_1_0) {
    const raw = Object.hasOwn(inTrends, id) ? inTrends[id] : undefined;
    const d = raw ? /** @type {Record<string, unknown>} */ (raw) : {};
    const sv = Number(d.stage);
    trends[id] = {
      stage: Number.isInteger(sv) && sv >= -1 && sv <= stages - 1 ? sv : -1,
      notes: typeof d.notes === 'string' ? d.notes : '',
    };
  }
  return { system: typeof o.system === 'string' ? o.system : '', trends };
}
