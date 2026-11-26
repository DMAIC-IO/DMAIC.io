/**
 * D.Mike — Stoff-Feld-Analyse (TRIZ): Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js, diagnosis.js oder standards.js (das Schema darf
 * sich ändern, die Migration nicht).
 */

/** Feldarten im Formatstand 1.0. */
const FIELD_TYPES_1_0 = ['M', 'A', 'T', 'C', 'E', 'Mg'];
/** Verknüpfungen im Formatstand 1.0. */
const LINK_TYPES_1_0 = ['useful', 'insufficient', 'excessive', 'harmful', 'missing'];
/** Listenfilter im Formatstand 1.0. */
const FILTER_MODES_1_0 = ['auto', 'all'];

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {string} der Text oder `''` */
const textOr = (v) => (typeof v === 'string' ? v : '');

/**
 * '0→1.0': jeder Stand ohne `_schema` (von Hand oder als Beispieldatei).
 * Wie das alte `State.fromJSON`: kein Objekt → Vorgabe; Texte als Text oder
 * leer; Feldart und Verknüpfung aus ihrer Liste oder leer; je Notiz nur
 * Textwerte; je Vormerkung der Wahrheitswert des Eintrags; der Listenfilter
 * `auto` oder `all`, sonst `auto`; von den aufgeklappten Klassen nur ganze
 * Zahlen. Unbekannte Standard-ids und Klassennummern bleiben stehen, die
 * Invarianten des Models verwerfen sie beim Laden mit Reparatur. Fremde
 * Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {{ s1: string, s2: string, field: string, link: string, problemNote: string, notes: Record<string, string>, selected: Record<string, boolean>, filterMode: string, expandedClasses: number[] }}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  return {
    s1: textOr(o.s1),
    s2: textOr(o.s2),
    field: FIELD_TYPES_1_0.includes(o.field) ? o.field : '',
    link: LINK_TYPES_1_0.includes(o.link) ? o.link : '',
    problemNote: textOr(o.problemNote),
    notes: isObject(o.notes)
      ? Object.fromEntries(Object.entries(o.notes).filter(([, v]) => typeof v === 'string'))
      : {},
    selected: isObject(o.selected)
      ? Object.fromEntries(Object.entries(o.selected).map(([k, v]) => [k, Boolean(v)]))
      : {},
    filterMode: FILTER_MODES_1_0.includes(o.filterMode) ? o.filterMode : 'auto',
    expandedClasses: Array.isArray(o.expandedClasses)
      ? o.expandedClasses.filter((n) => Number.isInteger(n))
      : [],
  };
}
