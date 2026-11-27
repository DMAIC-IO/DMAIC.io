/**
 * D.Mike — Kano: Migrationen. Rein.
 */

/** Wählbare Ebenen (wie `LEVELS` in `link.js`; Migrationen importieren nichts aus dem Model). */
const LEVELS = ['need', 'driver', 'req'];

/**
 * Ein ganzzahliger Skalenwert im Bereich, sonst `null`.
 * @param {unknown} v @param {number} max @returns {number|null}
 */
const onScale = (v, max) => (Number.isInteger(v) && /** @type {number} */ (v) >= 1 && /** @type {number} */ (v) <= max
  ? /** @type {number} */ (v) : null);

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {string} */
const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Elemente mit nichtleerer Text-`id`, in Reihenfolge.
 * @param {unknown} list @returns {Record<string, any>[]}
 */
const withId = (list) => (Array.isArray(list)
  ? list.filter((e) => isObj(e) && typeof e.id === 'string' && e.id !== '')
  : []);

/**
 * '0→1.0': Altstände ohne `_schema` (`{ source, options, items, respondents,
 * answers, activeRespondentId }`, wie das alte `State.fromJSON`, nie strenger).
 *
 * - `source.level` außerhalb der Ebenen → `'need'`; `source.instanceId` Text
 *   sonst `null`.
 * - `options.importance` folgt `!== false`.
 * - Merkmale und Befragte ohne Text-`id` (auch `''`) entfallen;
 *   `nodeId` Text sonst `null`, `label`/`path`/`name` Text sonst `''`,
 *   `missing` als Wahrheitswert. Die Marke `origin` entfällt. Doppelte ids
 *   bleiben stehen, sie räumt die Reparatur der Invarianten ab.
 * - Antworten nur auf bekannte ids und als Objekt; `f`/`d` ganze Zahl auf
 *   1–5, `w` auf 1–9, sonst `null` (die Auswertung zählte sie schon als
 *   unbeantwortet).
 * - `activeRespondentId` bekannt, sonst die erste Befragte, sonst `null`.
 * - Fremde Schlüssel entfallen.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  const src = isObj(json.source) ? json.source : {};
  const items = withId(json.items).map((i) => ({
    id: i.id,
    nodeId: typeof i.nodeId === 'string' ? i.nodeId : null,
    label: str(i.label),
    path: str(i.path),
    missing: Boolean(i.missing),
  }));
  const respondents = withId(json.respondents).map((r) => ({ id: r.id, name: str(r.name) }));
  const itemIds = new Set(items.map((i) => i.id));
  const respIds = new Set(respondents.map((r) => r.id));
  /** @type {Record<string, Record<string, { f: number|null, d: number|null, w: number|null }>>} */
  const answers = {};
  if (isObj(json.answers)) {
    for (const [rid, byItem] of Object.entries(json.answers)) {
      if (!respIds.has(rid) || !isObj(byItem)) continue;
      /** @type {Record<string, { f: number|null, d: number|null, w: number|null }>} */
      const kept = {};
      for (const [iid, a] of Object.entries(byItem)) {
        if (!itemIds.has(iid) || !isObj(a)) continue;
        kept[iid] = { f: onScale(a.f, 5), d: onScale(a.d, 5), w: onScale(a.w, 9) };
      }
      answers[rid] = kept;
    }
  }
  return {
    source: {
      instanceId: typeof src.instanceId === 'string' ? src.instanceId : null,
      level: LEVELS.includes(src.level) ? src.level : 'need',
    },
    options: { importance: !isObj(json.options) || json.options.importance !== false },
    items,
    respondents,
    answers,
    activeRespondentId: respIds.has(json.activeRespondentId)
      ? json.activeRespondentId
      : (respondents.length ? respondents[0].id : null),
  };
}
