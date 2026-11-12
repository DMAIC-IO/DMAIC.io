/**
 * D.Mike — Ishikawa: feste Listen des Models.
 *
 * Das Schema in `model.js` schreibt dieselben Listen als Literale; ein
 * Unit-Test hält beide gleich.
 */

/** Die sechs Kategorien (6M) in Anzeigereihenfolge. */
export const CAT_KEYS = Object.freeze(['man', 'machine', 'environment', 'material', 'measurement', 'method']);

/** Status einer Ursache. */
export const STATUS_KEYS = Object.freeze(['open', 'testing', 'confirmed', 'rejected']);

/** Status eines Experiments. */
export const EXP_STATUS = Object.freeze(['planned', 'running', 'done', 'cancelled']);

/**
 * Farben der Experten in Vergabereihenfolge (Index modulo Länge). Gespeichert
 * wird der Hexwert am Experten; die Liste ist darum gespeichertes Format.
 */
export const EXP_COLS = Object.freeze([
  '#6366f1', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#2563eb', '#84cc16', '#f97316',
]);
