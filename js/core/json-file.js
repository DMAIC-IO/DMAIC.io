/**
 * D.Mike — JSON-Dateien der Module lesen (json-file.js)
 *
 * Jede Datei eines Formats trägt `$schema` als Editor-Verweis auf ihr JSON
 * Schema (app/dev/schemas/). Laufzeit und Werkzeuge entfernen ihn beim Lesen,
 * damit er nie in `modules.<id>` oder einem Registry-Eintrag landet.
 */

/**
 * Den Schlüssel `$schema` auf oberster Ebene entfernen.
 * @template T
 * @param {T} value
 * @returns {T} flache Kopie ohne `$schema`; ohne den Schlüssel derselbe Wert
 */
export function withoutSchema(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, '$schema')) return value;
  const rest = { ...value };
  delete rest.$schema;
  return rest;
}
