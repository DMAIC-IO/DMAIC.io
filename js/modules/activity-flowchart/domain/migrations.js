/**
 * D.Mike — Activity-Flowchart: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */

/** Schrittarten im Formatstand 1.0. */
const KINDS_1_0 = ['activity', 'decision'];

/** @param {unknown} v @returns {string} der Text, sonst leer */
function str(v) {
  return typeof v === 'string' ? v : '';
}

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Eine vorhandene id bleibt unverändert; fehlt sie (oder ist leer), gilt
 * `fallback`, bei Kollision mit `taken` um `_` ergänzt und in `taken` eingetragen.
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
 * Band-id der Altform: `'main'` oder `no:<nicht leer>`, sonst `'main'`.
 * @param {unknown} raw @returns {string}
 */
function branchIdOf(raw) {
  return typeof raw === 'string' && raw.startsWith('no:') && raw.length > 3 ? raw : 'main';
}

/**
 * Ziel des Nein-Zweigs der Altform: `'next'`, Fehlendes und Leeres → `'end'`.
 * @param {unknown} t @returns {string}
 */
function targetOf(t) {
  return typeof t === 'string' && t !== '' && t !== 'next' ? t : 'end';
}

/**
 * '0→1.0': Altstände ohne `_schema`. Nur Objekte zählen als Schritt. Jeder
 * Schritt behält `id`, `title`, `description`, `kind` (sonst `activity`),
 * `branchId` und `substeps` (`id`, `title`); `decision` steht genau bei einer
 * Raute (`{ label, noTarget }`, `next` und Fehlendes → `end`, `yesTarget`
 * entfällt), bei einer Aktivität `null`. Ein Ziel auf eine unbekannte oder die
 * eigene id wird `end`. Fehlende ids werden ersetzt: `s0m<Schrittindex>` und
 * `ss0m<Schrittindex>_<Unterschrittindex>`, bei Kollision mit `_` ergänzt.
 * Ein Band gilt nur, wenn seine Raute davor steht, sonst Hauptpfad.
 * `expanded: true` am Schritt wandert als id nach `expanded` (Ansichtsfeld);
 * alle anderen Schrittschlüssel entfallen.
 * @param {object} json Kopie des gespeicherten Zustands
 * @returns {{ steps: object[], expanded: string[] }}
 */
export function from0(json) {
  const source = (Array.isArray(/** @type {any} */ (json).steps) ? /** @type {any} */ (json).steps : []).filter(isObject);
  const taken = new Set();
  for (const raw of source) {
    if (typeof raw.id === 'string') taken.add(raw.id);
    if (Array.isArray(raw.substeps)) for (const s of raw.substeps) if (typeof s?.id === 'string') taken.add(s.id);
  }
  const expanded = [];
  /** @type {any[]} */
  const steps = source.map((raw, at) => {
    const id = idOrFallback(raw.id, `s0m${at}`, taken);
    const kind = KINDS_1_0.includes(raw.kind) ? raw.kind : 'activity';
    const substeps = Array.isArray(raw.substeps)
      ? raw.substeps.filter(isObject).map((s, i) => ({ id: idOrFallback(s.id, `ss0m${at}_${i}`, taken), title: str(s.title) }))
      : [];
    if (raw.expanded === true && !expanded.includes(id)) expanded.push(id);
    return {
      id,
      title: str(raw.title),
      description: str(raw.description),
      kind,
      branchId: branchIdOf(raw.branchId),
      decision: kind === 'decision'
        ? { label: str(raw.decision?.label), noTarget: targetOf(raw.decision?.noTarget) }
        : null,
      substeps,
    };
  });

  const ids = new Set(steps.map((s) => s.id));
  const open = new Set(['main']);
  for (const s of steps) {
    if (s.decision && (s.decision.noTarget === s.id || (s.decision.noTarget !== 'end' && !ids.has(s.decision.noTarget)))) {
      s.decision.noTarget = 'end';
    }
    if (!open.has(s.branchId)) s.branchId = 'main';
    if (s.kind === 'decision') open.add(`no:${s.id}`);
  }
  return { steps, expanded };
}
