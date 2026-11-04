/**
 * D.Mike — Hilfe-Dateien der Module in neuer Form (module-help-files.js)
 *
 * Ein Modul in neuer Form bringt sein Handbuch je Sprache mit
 * (resources/i18n/help.<lang>.json: `{ sections: { <sec>: { title, blocks } } }`).
 * Hilfe-Panel (renderModuleHelp), Agentenfläche und statisches Handbuch
 * erwarten die Form der alten `<id>-help.js`:
 * `{ moduleId, sections: { <sec>: { <lang>: { title, blocks } } } }`.
 */

/**
 * Eine Sprachdatei in die Hilfe-Definition bringen.
 * @param {string} id
 * @param {string} lang
 * @param {{ sections?: Record<string, object> }} file  ohne $schema
 * @returns {{ moduleId: string, sections: Record<string, Record<string, object>> }}
 */
export function helpDefFromFile(id, lang, file) {
  return helpDefFromFiles(id, { [lang]: file });
}

/**
 * Mehrere Sprachdateien zu einer Hilfe-Definition zusammenführen. Reihenfolge
 * der Abschnitte: die der ersten Datei, dahinter Abschnitte, die nur spätere haben.
 * @param {string} id
 * @param {Record<string, { sections?: Record<string, object> } | undefined>} files  Sprache → Datei
 * @returns {{ moduleId: string, sections: Record<string, Record<string, object>> }}
 */
export function helpDefFromFiles(id, files) {
  /** @type {Record<string, Record<string, object>>} */
  const sections = {};
  for (const [lang, file] of Object.entries(files)) {
    for (const [sec, body] of Object.entries(file?.sections ?? {})) {
      (sections[sec] ??= {})[lang] = body;
    }
  }
  return { moduleId: id, sections };
}
