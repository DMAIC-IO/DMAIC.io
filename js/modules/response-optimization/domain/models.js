/**
 * D.Mike — Zielgrößenoptimierung: die gespeicherten Modelle lesen und die
 * wirksamen Vorgaben bilden. Rein.
 *
 * Ein Modell gehört der Regressions- bzw. GLM-Instanz, die es gespeichert hat
 * (`derived savedModel`); gelesen wird es über den Leser `src`. Eine Instanz,
 * deren Modul noch nicht geladen ist, zählt als ungelesen. Die Vorgabe eines
 * Modells ist die gespeicherte, fehlende Schlüssel kommen aus der Saat: die
 * Spanne der Trainingswerte (ohne Daten 0 bis 1), Maximieren, Gewicht 1.
 */

/** Die Module, die Modelle speichern. */
export const OWNER_MODULES = Object.freeze(['regression', 'glm-regression']);

/** Die Schlüssel einer Vorgabe. */
export const SPEC_KEYS = Object.freeze(['selected', 'kind', 'lower', 'upper', 'target', 'weight']);

/** @typedef {import('../../../core/source-reader.js').Source} Source */
/**
 * @typedef {Record<string, any> & { id: string, name: string, instanceId: string, moduleId: string }} ModelRecord
 * @typedef {{ selected: boolean, kind: 'max'|'min'|'target', lower: number, upper: number, target: number, weight: number }} SpecEntry
 */

/** @param {unknown} v @returns {v is number} */
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Die gespeicherten Modelle der Besitzer in Projektreihenfolge und die
 * Besitzer, die noch nicht lesbar sind. Trägt eine zweite Instanz dieselbe
 * Modell-id (kopierte Instanz), gilt die erste.
 * @param {Source} src
 * @returns {{ records: ModelRecord[], unread: string[] }}
 */
export function readOwners(src) {
  /** @type {ModelRecord[]} */
  const records = [];
  /** @type {string[]} */
  const unread = [];
  const seen = new Set();
  for (const inst of src.list()) {
    if (!OWNER_MODULES.includes(inst.moduleId)) continue;
    let saved;
    try {
      saved = /** @type {any} */ (src.read(inst.instanceId, { fields: ['savedModel'] }))?.savedModel;
    } catch (err) {
      if (/** @type {any} */ (err)?.code === 'not_loaded') unread.push(inst.instanceId);
      continue;
    }
    if (!saved || typeof saved !== 'object' || typeof saved.id !== 'string' || seen.has(saved.id)) continue;
    seen.add(saved.id);
    records.push({ ...saved, name: typeof saved.name === 'string' && saved.name ? saved.name : saved.id, instanceId: inst.instanceId, moduleId: inst.moduleId });
  }
  return { records, unread };
}

/**
 * Die Spanne der Trainingswerte eines Modells; ohne Daten `[0, 1]`.
 * @param {Record<string, any>} record
 * @returns {[number, number]}
 */
export function yRangeOf(record) {
  const ys = (record?.dataSnapshot?.y ?? []).filter(isFiniteNumber);
  if (ys.length === 0) return [0, 1];
  return [Math.min(...ys), Math.max(...ys)];
}

/**
 * Die Saat einer Vorgabe aus den Modelldaten (Altform `reconcileSpecs`).
 * @param {[number, number]} yRange
 * @returns {SpecEntry}
 */
export function seedSpec([lo, hi]) {
  return { selected: false, kind: 'max', lower: lo, upper: hi, target: (lo + hi) / 2, weight: 1 };
}

/**
 * Die wirksame Vorgabe: die gespeicherten Schlüssel über der Saat.
 * @param {Record<string, any>|undefined} stored
 * @param {[number, number]} yRange
 * @returns {SpecEntry}
 */
export function effectiveSpec(stored, yRange) {
  const out = seedSpec(yRange);
  if (!stored) return out;
  for (const k of SPEC_KEYS) {
    if (Object.hasOwn(stored, k) && stored[k] !== undefined) /** @type {any} */ (out)[k] = stored[k];
  }
  return out;
}

/**
 * Die ids der gewählten Modelle in der Reihenfolge der gespeicherten Vorgaben
 * (wie die Altform), nur solche, die es gibt.
 * @param {Record<string, any>} specs gespeicherte Vorgaben
 * @param {ReadonlySet<string>|string[]} available ids der lesbaren Modelle
 * @returns {string[]}
 */
export function selectedIdsOf(specs, available) {
  const has = available instanceof Set ? available : new Set(available);
  return Object.keys(specs).filter((id) => specs[id]?.selected === true && has.has(id));
}
