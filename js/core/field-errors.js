/**
 * D.Mike — letzte Ablehnung je x-field (field-errors.js)
 *
 * Speicher hinter `fieldError(path)` einer Komponente der neuen Form. Schlüssel
 * ist der Ausdruck des `x-field` (`model.lsl`). Ein Eintrag merkt sich die
 * Werte seiner Wurzelfelder (Feldregel: das Feld selbst; Invariante: deren
 * Felder) und gilt nur, solange das Model sie noch hat. So löscht jedes
 * gültige Schreiben des Felds oder eines Invariantenpartners die Meldung,
 * gleich über welchen Weg.
 */

/**
 * @typedef {{ set: (path: string, entry: { message: string, model: object, fields: string[] }) => void,
 *   clear: (path: string) => void, message: (path: string) => string }} FieldErrors
 */

/**
 * Einen Speicher anlegen (je Komponente einer).
 * @param {{ reactive: (o: object) => object }} Alpine
 * @returns {FieldErrors}
 */
export function createFieldErrors(Alpine) {
  /** @type {Map<string, { message: string, model: object, fields: string[], values: any[] }>} */
  const entries = new Map();
  // Nur der Zähler je Pfad ist reaktiv: das Model bleibt so, wie es übergeben wurde.
  const version = Alpine.reactive({});
  const bump = (path) => { version[path] = (version[path] ?? 0) + 1; };
  return {
    set(path, { message, model, fields }) {
      entries.set(path, { message, model, fields: [...fields], values: fields.map((f) => model[f]) });
      bump(path);
    },
    clear(path) {
      if (entries.delete(path)) bump(path);
    },
    message(path) {
      void version[path];
      const e = entries.get(path);
      if (!e) return '';
      return e.fields.every((f, i) => Object.is(e.model[f], e.values[i])) ? e.message : '';
    },
  };
}
