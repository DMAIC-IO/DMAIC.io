/**
 * D.Mike — letzte Ablehnung je x-field (field-errors.js)
 *
 * Speicher hinter `fieldError(path)` einer Komponente der neuen Form. Schlüssel
 * ist der Ausdruck des `x-field` (`model.lsl`). Ein Eintrag merkt sich die
 * Werte seiner Wurzelfelder (Feldregel: das Feld selbst; Invariante: deren
 * Felder). Sobald einer davon abweicht — gleich über welchen Weg —, ist der
 * Eintrag gelöscht, nicht nur verborgen: die Rückkehr zum gemerkten Wert bringt
 * die Meldung nicht zurück. Ein Effekt je Eintrag bemerkt die Abweichung auch
 * dann, wenn das Template den Pfad gerade nicht liest (`x-if`, `a || b`).
 */

/**
 * @typedef {{ set: (path: string, entry: { message: string, model: object, fields: string[] }) => void,
 *   clear: (path: string) => void, message: (path: string) => string, dispose: () => void }} FieldErrors
 */

/**
 * Einen Speicher anlegen (je Komponente einer; `dispose()` beim Abbau).
 * @param {{ reactive: (o: object) => object, effect: (fn: () => void) => any, release: (h: any) => void }} Alpine
 * @returns {FieldErrors}
 */
export function createFieldErrors(Alpine) {
  /** @type {Map<string, { message: string, model: object, fields: string[], values: any[], watch: any }>} */
  const entries = new Map();
  // Nur der Zähler je Pfad ist reaktiv: das Model bleibt so, wie es übergeben wurde.
  const version = Alpine.reactive({});
  const bump = (path) => { version[path] = (version[path] ?? 0) + 1; };
  const unchanged = (e) => e.fields.every((f, i) => Object.is(e.model[f], e.values[i]));
  const drop = (path) => {
    const e = entries.get(path);
    if (!e) return false;
    entries.delete(path);
    if (e.watch) Alpine.release(e.watch);
    return true;
  };
  return {
    set(path, { message, model, fields }) {
      drop(path);
      const entry = { message, model, fields: [...fields], values: fields.map((f) => model[f]), watch: null };
      entries.set(path, entry);
      // Der Effekt liest die Wurzelfelder und löscht beim ersten Abweichen.
      // Er läuft sofort einmal (ohne Abweichung), danach über Alpines Scheduler.
      entry.watch = Alpine.effect(() => {
        if (unchanged(entry) || entries.get(path) !== entry) return;
        if (drop(path)) bump(path);
      });
      bump(path);
    },
    clear(path) {
      if (drop(path)) bump(path);
    },
    message(path) {
      void version[path];
      const e = entries.get(path);
      if (!e) return '';
      if (unchanged(e)) return e.message;
      // Synchron gelesen, bevor der Effekt lief: hier schon löschen.
      drop(path);
      return '';
    },
    dispose() {
      for (const path of [...entries.keys()]) drop(path);
    },
  };
}
