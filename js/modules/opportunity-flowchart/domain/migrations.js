/**
 * D.Mike — Opportunity-Flowchart: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */

/** Seiten im Formatstand 1.0. */
const SIDES_1_0 = ['va', 'nva'];

/** @param {unknown} v @returns {string} der Text, sonst leer */
function str(v) {
  return typeof v === 'string' ? v : '';
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
 * '0→1.0': Altstände ohne `_schema`. Die Schritte behalten `id`, `title`,
 * `description`, `side` (sonst `'va'`) und `substeps` (`id`, `title`); alle
 * anderen Schrittfelder fallen weg. Fehlende ids werden ersetzt: `s0m<Schrittindex>` und
 * `ss0m<Schrittindex>_<Unterschrittindex>`, bei Kollision mit `_` ergänzt. `expanded: true` am Schritt wandert als id
 * nach `expanded` (Ansichtsfeld).
 * @param {object} json Kopie des gespeicherten Zustands
 * @returns {{ steps: object[], expanded: string[] }}
 */
export function from0(json) {
  const source = Array.isArray(json.steps) ? json.steps : [];
  const steps = [];
  const expanded = [];
  const taken = new Set();
  for (const raw of source) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    if (typeof raw.id === 'string') taken.add(raw.id);
    if (Array.isArray(raw.substeps)) for (const s of raw.substeps) if (typeof s?.id === 'string') taken.add(s.id);
  }
  let at = -1;
  for (const raw of source) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    at += 1;
    const id = idOrFallback(raw.id, `s0m${at}`, taken);
    const substeps = Array.isArray(raw.substeps)
      ? raw.substeps
        .filter((s) => s !== null && typeof s === 'object' && !Array.isArray(s))
        .map((s, i) => ({ id: idOrFallback(s.id, `ss0m${at}_${i}`, taken), title: str(s.title) }))
      : [];
    steps.push({
      id,
      title: str(raw.title),
      description: str(raw.description),
      side: SIDES_1_0.includes(raw.side) ? raw.side : 'va',
      substeps,
    });
    if (raw.expanded === true && !expanded.includes(id)) expanded.push(id);
  }
  return { steps, expanded };
}
