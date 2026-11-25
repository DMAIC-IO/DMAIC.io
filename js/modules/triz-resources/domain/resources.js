/**
 * D.Mike — TRIZ-Ressourcen: Kategorien, Systemebenen und Füllstände.
 *
 * Reihenfolge wie in der Oberfläche und im gespeicherten Zustand: Kategorien
 * sind die Zeilen, Ebenen die Spalten des Rasters. Die Füllstände stehen in
 * der Reihenfolge, die der Statusknopf durchläuft.
 */

/** @type {ReadonlyArray<string>} die sechs Ressourcenkategorien */
export const CATEGORIES = Object.freeze(['substance', 'field', 'space', 'time', 'info', 'function']);

/** @type {ReadonlyArray<string>} die drei Systemebenen */
export const LEVELS = Object.freeze(['sub', 'sys', 'super']);

/** @type {ReadonlyArray<string>} die vier Füllstände einer Zelle */
export const STATUSES = Object.freeze(['unknown', 'unused', 'partial', 'full']);

/**
 * Der Füllstand nach einem Klick; nach `full` folgt wieder `unknown`, ein
 * unbekannter Wert ergibt `unknown`.
 * @param {string} status @returns {string}
 */
export function nextStatus(status) {
  return STATUSES[(STATUSES.indexOf(status) + 1) % STATUSES.length];
}
