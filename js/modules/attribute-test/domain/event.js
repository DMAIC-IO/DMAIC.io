/**
 * D.Mike — Attributtest: Werte einer Spalte und der Ereigniswert.
 *
 * Rein: Werte kommen herein, Texte gehen hinaus. Der gespeicherte
 * Ereigniswert bleibt stehen; wirksam ist er nur, solange er unter den Werten
 * vorkommt, sonst der letzte Wert (Minitab-Konvention).
 */

/**
 * Fehlt der Wert (leer, nur Leerzeichen, `null`, `NaN`)?
 * @param {unknown} v @returns {boolean}
 */
export function isMissing(v) {
  return v == null || (typeof v === 'number' && Number.isNaN(v)) || String(v).trim() === '';
}

/**
 * Die verschiedenen, nicht fehlenden Werte als getrimmte Texte, natürlich sortiert.
 * @param {readonly unknown[]|null|undefined} values
 * @returns {string[]}
 */
export function distinctValues(values) {
  const set = new Set();
  for (const v of values || []) if (!isMissing(v)) set.add(String(v).trim());
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Der wirksame Ereigniswert: der gespeicherte, wenn er unter den Werten ist,
 * sonst der letzte; ohne Werte der gespeicherte.
 * @param {string|null} stored
 * @param {readonly string[]} options verschiedene Werte (`distinctValues`)
 * @returns {string|null}
 */
export function effectiveEvent(stored, options) {
  if (!options.length) return stored;
  return stored != null && options.includes(stored) ? stored : options[options.length - 1];
}
