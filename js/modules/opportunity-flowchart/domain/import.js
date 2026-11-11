/**
 * D.Mike — Opportunity-Flowchart: Import aus der `read()`-Form anderer Module.
 * Reine Funktionen; die Instanzen holt der Aufrufer über den Instanzendienst.
 */

/** Module, aus denen Schritte übernommen werden können. */
export const IMPORT_SOURCES = Object.freeze(['process-map', 'sipoc']);

/** @param {unknown} v @returns {string[]} getrimmte, nicht leere Texte */
function cleanStrings(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
}

/**
 * Seitenwahl aus der Wertart: `nva`/`bnva` → `nva`, sonst `va`.
 * @param {unknown} valueType @returns {'va'|'nva'}
 */
function sideOf(valueType) {
  return valueType === 'nva' || valueType === 'bnva' ? 'nva' : 'va';
}

/**
 * Startschritte aus der `read()`-Form einer Quellinstanz.
 * @param {string} moduleId @param {any} read
 * @returns {Array<{ title: string, description: string, side: 'va'|'nva' }>}
 */
export function seedsFromRead(moduleId, read) {
  if (moduleId === 'sipoc') {
    return cleanStrings(read?.columns?.process).map((title) => ({ title, description: '', side: 'va' }));
  }
  if (moduleId === 'process-map') {
    const steps = Array.isArray(read?.steps) ? read.steps : [];
    return steps.map((s) => ({
      title: typeof s?.title === 'string' ? s.title : '',
      description: typeof s?.description === 'string' ? s.description : '',
      side: sideOf(s?.valueType),
    }));
  }
  return [];
}
