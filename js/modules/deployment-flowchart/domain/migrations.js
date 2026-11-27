/**
 * D.Mike — Deployment-Flowchart: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */

/** Reservierte Bahn im Formatstand 1.0. */
const UNASSIGNED_1_0 = 'unassigned';

/** @param {unknown} v @returns {string} der Text, sonst leer */
function str(v) {
  return typeof v === 'string' ? v : '';
}

/** @param {unknown} v @returns {v is Record<string, any>} ein einfaches Objekt */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Eine vorhandene id bleibt unverändert; fehlt sie, gilt `fallback`, bei Kollision mit `taken` um `_` ergänzt
 * und in `taken` eingetragen.
 * @param {unknown} id @param {string} fallback @param {Set<string>} taken @returns {string}
 */
function idOrFallback(id, fallback, taken) {
  if (typeof id === 'string' && id !== '') return id;
  let out = fallback;
  while (taken.has(out)) out += '_';
  taken.add(out);
  return out;
}

/**
 * Bahnen: nur Objekte, stabil nach `order` sortiert (Zahl, sonst die Position
 * in der Liste); `order` entfällt, die Position ist die Ordnung. Fehlende ids
 * werden `lane0m<Position>` (fest, damit wiederholtes Migrieren dieselben ids
 * liefert), `name` ist Text, sonst leer.
 * @param {unknown} raw @returns {Array<{ id: string, name: string }>}
 */
function lanesFrom0(raw) {
  const source = (Array.isArray(raw) ? raw : []).filter(isObject);
  const taken = new Set(source.map((l) => l.id).filter((id) => typeof id === 'string'));
  return source
    .map((l, at) => ({ l, at, key: typeof l.order === 'number' && Number.isFinite(l.order) ? l.order : at }))
    .sort((a, b) => a.key - b.key || a.at - b.at)
    .map(({ l, at }) => ({ id: idOrFallback(l.id, `lane0m${at}`, taken), name: str(l.name) }));
}

/**
 * '0→1.0': Altstände ohne `_schema`. Die Schritte behalten `id`, `title`,
 * `description`, `laneId` (nicht leerer Text, sonst `unassigned`) und
 * `substeps` (`id`, `title`); alle anderen Schrittfelder fallen weg. Fehlende
 * ids werden ersetzt: `s0m<Schrittindex>` und
 * `ss0m<Schrittindex>_<Unterschrittindex>`, bei Kollision mit `_` ergänzt.
 * `expanded: true` am Schritt wandert als id nach `expanded` (Ansichtsfeld).
 * Nennt ein Schritt `unassigned` und fehlt diese Bahn, wird sie hinten
 * angelegt. Unbekannte Bahnen heilt das Laden mit Reparatur.
 * @param {object} json Kopie des gespeicherten Zustands
 * @returns {{ steps: object[], lanes: object[], expanded: string[] }}
 */
export function from0(json) {
  const source = Array.isArray(json.steps) ? json.steps : [];
  const steps = [];
  const expanded = [];
  const taken = new Set();
  for (const raw of source) {
    if (!isObject(raw)) continue;
    if (typeof raw.id === 'string') taken.add(raw.id);
    if (Array.isArray(raw.substeps)) for (const s of raw.substeps) if (typeof s?.id === 'string') taken.add(s.id);
  }
  let at = -1;
  for (const raw of source) {
    if (!isObject(raw)) continue;
    at += 1;
    const id = idOrFallback(raw.id, `s0m${at}`, taken);
    const substeps = Array.isArray(raw.substeps)
      ? raw.substeps
        .filter(isObject)
        .map((s, i) => ({ id: idOrFallback(s.id, `ss0m${at}_${i}`, taken), title: str(s.title) }))
      : [];
    steps.push({
      id,
      title: str(raw.title),
      description: str(raw.description),
      laneId: typeof raw.laneId === 'string' && raw.laneId !== '' ? raw.laneId : UNASSIGNED_1_0,
      substeps,
    });
    if (raw.expanded === true && !expanded.includes(id)) expanded.push(id);
  }
  const lanes = lanesFrom0(json.lanes);
  if (steps.some((s) => s.laneId === UNASSIGNED_1_0) && !lanes.some((l) => l.id === UNASSIGNED_1_0)) {
    lanes.push({ id: UNASSIGNED_1_0, name: '' });
  }
  return { steps, lanes, expanded };
}
