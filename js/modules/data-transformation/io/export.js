/**
 * D.Mike — Datentransformation, Export: die Paare aus Original und
 * transformiertem Wert (für `exports.table()`, CSV und XLSX), der Text des
 * Exportkastens (Zwischenablage) und der Dateiname wie in der Altform.
 */

/** Dateiname ohne Endung, wie in der Altform. */
export const FILE_NAME = 'transformation';

/**
 * Kopf mit den übersetzten Spaltennamen, je Wertepaar eine Zeile mit den
 * rohen Zahlen. Ohne Werte `null`.
 * @param {ReadonlyArray<number>} original @param {ReadonlyArray<number>} transformed
 * @param {[string, string]} header übersetzt: Original, Transformiert
 * @returns {(string|number)[][]|null}
 */
export function toRows(original, transformed, header) {
  if (!transformed.length) return null;
  return [[...header], ...transformed.map((v, i) => [original[i], v])];
}

/**
 * Der Text des Exportkastens und der Zwischenablage: je Wert eine Zeile mit
 * sechs Nachkommastellen und Punkt, zeichengleich mit der Altform (ein
 * fremdes Programm liest ihn beim Einfügen).
 * @param {ReadonlyArray<number>} transformed @returns {string}
 */
export function exportText(transformed) {
  return transformed.map((v) => v.toFixed(6)).join('\n');
}
