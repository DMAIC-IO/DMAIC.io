/**
 * D.Mike — Stoff-Feld-Analyse (TRIZ): die feste Tabelle der 78
 * Standardlösungen nach Altschuller.
 *
 * Je Eintrag die id (`Klasse.Gruppe.Lösung`), die Klasse (1 bis 5) und die
 * Gruppe (`Klasse.Gruppe`), in aufsteigender Reihenfolge der ids. Je Klasse
 * 13, 25, 6, 17 und 17 Einträge in 18 Gruppen.
 *
 * Herkunft: die frühere Quelldatei `data/standards.json` des Moduls, aus der
 * diese Tabelle einmalig erzeugt wurde; mit ihr in id, Klasse, Gruppe und
 * Reihenfolge gleich.
 *
 * Titel, Beschreibung, Auslöser und Beispiel je Standardlösung stehen nicht
 * hier, sondern in den Übersetzungen des Moduls unter `standards.<id>`
 * (etwa `standards.2.2.5.title`).
 */

/**
 * Eine Standardlösung der Tabelle.
 * @typedef {object} Standard
 * @property {string} id  Nummer der Standardlösung, Klasse.Gruppe.Lösung
 * @property {number} class  Standardklasse, 1 bis 5
 * @property {string} group  Gruppe, Klasse.Gruppe
 */

/**
 * Die 78 Standardlösungen in Reihenfolge der ids, eingefroren bis in die
 * Einträge.
 * @type {ReadonlyArray<Readonly<Standard>>}
 */
export const STANDARDS = Object.freeze([
  Object.freeze({ id: '1.1.1', class: 1, group: '1.1' }),
  Object.freeze({ id: '1.1.2', class: 1, group: '1.1' }),
  Object.freeze({ id: '1.1.3', class: 1, group: '1.1' }),
  Object.freeze({ id: '1.1.4', class: 1, group: '1.1' }),
  Object.freeze({ id: '1.1.5', class: 1, group: '1.1' }),
  Object.freeze({ id: '1.1.6', class: 1, group: '1.1' }),
  Object.freeze({ id: '1.1.7', class: 1, group: '1.1' }),
  Object.freeze({ id: '1.1.8', class: 1, group: '1.1' }),
  Object.freeze({ id: '1.2.1', class: 1, group: '1.2' }),
  Object.freeze({ id: '1.2.2', class: 1, group: '1.2' }),
  Object.freeze({ id: '1.2.3', class: 1, group: '1.2' }),
  Object.freeze({ id: '1.2.4', class: 1, group: '1.2' }),
  Object.freeze({ id: '1.2.5', class: 1, group: '1.2' }),
  Object.freeze({ id: '2.1.1', class: 2, group: '2.1' }),
  Object.freeze({ id: '2.1.2', class: 2, group: '2.1' }),
  Object.freeze({ id: '2.2.1', class: 2, group: '2.2' }),
  Object.freeze({ id: '2.2.2', class: 2, group: '2.2' }),
  Object.freeze({ id: '2.2.3', class: 2, group: '2.2' }),
  Object.freeze({ id: '2.2.4', class: 2, group: '2.2' }),
  Object.freeze({ id: '2.2.5', class: 2, group: '2.2' }),
  Object.freeze({ id: '2.2.6', class: 2, group: '2.2' }),
  Object.freeze({ id: '2.3.1', class: 2, group: '2.3' }),
  Object.freeze({ id: '2.3.2', class: 2, group: '2.3' }),
  Object.freeze({ id: '2.3.3', class: 2, group: '2.3' }),
  Object.freeze({ id: '2.3.4', class: 2, group: '2.3' }),
  Object.freeze({ id: '2.3.5', class: 2, group: '2.3' }),
  Object.freeze({ id: '2.4.1', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.2', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.3', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.4', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.5', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.6', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.7', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.8', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.9', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.10', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.11', class: 2, group: '2.4' }),
  Object.freeze({ id: '2.4.12', class: 2, group: '2.4' }),
  Object.freeze({ id: '3.1.1', class: 3, group: '3.1' }),
  Object.freeze({ id: '3.1.2', class: 3, group: '3.1' }),
  Object.freeze({ id: '3.1.3', class: 3, group: '3.1' }),
  Object.freeze({ id: '3.1.4', class: 3, group: '3.1' }),
  Object.freeze({ id: '3.1.5', class: 3, group: '3.1' }),
  Object.freeze({ id: '3.2.1', class: 3, group: '3.2' }),
  Object.freeze({ id: '4.1.1', class: 4, group: '4.1' }),
  Object.freeze({ id: '4.1.2', class: 4, group: '4.1' }),
  Object.freeze({ id: '4.1.3', class: 4, group: '4.1' }),
  Object.freeze({ id: '4.2.1', class: 4, group: '4.2' }),
  Object.freeze({ id: '4.2.2', class: 4, group: '4.2' }),
  Object.freeze({ id: '4.2.3', class: 4, group: '4.2' }),
  Object.freeze({ id: '4.2.4', class: 4, group: '4.2' }),
  Object.freeze({ id: '4.3.1', class: 4, group: '4.3' }),
  Object.freeze({ id: '4.3.2', class: 4, group: '4.3' }),
  Object.freeze({ id: '4.3.3', class: 4, group: '4.3' }),
  Object.freeze({ id: '4.4.1', class: 4, group: '4.4' }),
  Object.freeze({ id: '4.4.2', class: 4, group: '4.4' }),
  Object.freeze({ id: '4.4.3', class: 4, group: '4.4' }),
  Object.freeze({ id: '4.4.4', class: 4, group: '4.4' }),
  Object.freeze({ id: '4.4.5', class: 4, group: '4.4' }),
  Object.freeze({ id: '4.5.1', class: 4, group: '4.5' }),
  Object.freeze({ id: '4.5.2', class: 4, group: '4.5' }),
  Object.freeze({ id: '5.1.1', class: 5, group: '5.1' }),
  Object.freeze({ id: '5.1.2', class: 5, group: '5.1' }),
  Object.freeze({ id: '5.1.3', class: 5, group: '5.1' }),
  Object.freeze({ id: '5.1.4', class: 5, group: '5.1' }),
  Object.freeze({ id: '5.2.1', class: 5, group: '5.2' }),
  Object.freeze({ id: '5.2.2', class: 5, group: '5.2' }),
  Object.freeze({ id: '5.2.3', class: 5, group: '5.2' }),
  Object.freeze({ id: '5.3.1', class: 5, group: '5.3' }),
  Object.freeze({ id: '5.3.2', class: 5, group: '5.3' }),
  Object.freeze({ id: '5.3.3', class: 5, group: '5.3' }),
  Object.freeze({ id: '5.3.4', class: 5, group: '5.3' }),
  Object.freeze({ id: '5.3.5', class: 5, group: '5.3' }),
  Object.freeze({ id: '5.4.1', class: 5, group: '5.4' }),
  Object.freeze({ id: '5.4.2', class: 5, group: '5.4' }),
  Object.freeze({ id: '5.5.1', class: 5, group: '5.5' }),
  Object.freeze({ id: '5.5.2', class: 5, group: '5.5' }),
  Object.freeze({ id: '5.5.3', class: 5, group: '5.5' }),
]);

/** Die ids der 78 Standardlösungen in Tabellenreihenfolge. @type {ReadonlyArray<string>} */
export const STANDARD_IDS = Object.freeze(STANDARDS.map((s) => s.id));

/** Die Nummern der fünf Standardklassen. @type {ReadonlyArray<number>} */
export const CLASS_NUMBERS = Object.freeze([1, 2, 3, 4, 5]);

/**
 * Die Standardlösungen je Klasse, in Reihenfolge der Klassen und der ids.
 * @type {ReadonlyArray<Readonly<{ cls: number, standards: ReadonlyArray<Readonly<Standard>> }>>}
 */
export const STANDARD_CLASSES = Object.freeze(CLASS_NUMBERS.map((cls) => Object.freeze({
  cls,
  standards: Object.freeze(STANDARDS.filter((s) => s.class === cls)),
})));
