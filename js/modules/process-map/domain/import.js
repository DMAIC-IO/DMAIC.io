/**
 * D.Mike — Process Map: Übernahme aus der `read()`-Form eines SIPOC.
 * Reine Funktionen; die Instanzen holt der Aufrufer über den Instanzendienst.
 */

/** Höchstzahl der Prozessschritte in der Vorschau einer Auswahlzeile. */
export const PREVIEW_MAX = 4;

/** @param {unknown} v @returns {string[]} getrimmte, nicht leere Texte */
function cleanStrings(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
}

/**
 * Zahl und Vorschau der Prozessschritte (Spalte P) eines SIPOC.
 * @param {any} read `read()` der SIPOC-Instanz
 * @returns {{ processCount: number, processPreview: string[] }}
 */
export function sipocSummary(read) {
  const process = cleanStrings(read?.columns?.process);
  return { processCount: process.length, processPreview: process.slice(0, PREVIEW_MAX) };
}

/**
 * Startschritte aus der Spalte P eines SIPOC, je nicht leerem Eintrag einer.
 * @param {any} read `read()` der SIPOC-Instanz
 * @returns {Array<{ title: string }>}
 */
export function seedsFromSipoc(read) {
  return cleanStrings(read?.columns?.process).map((title) => ({ title }));
}
