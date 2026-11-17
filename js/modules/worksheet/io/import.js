/**
 * D.Mike — Arbeitsblatt: Datei-Eingabe (io/import.js)
 *
 * Welche Dateien das Arbeitsblatt annimmt und ihr Text. Wie in der Altform
 * (`DataGrid._handleFileImport`) liest es CSV und TSV; der Text geht als
 * Kommando `importCsv` ans Model (Parser aus `core/parser/`). Andere Endungen
 * (auch Excel, das die Altform anbot, aber nicht las) melden
 * `unsupported`.
 */

/** `accept` der Dateiauswahl, wie im Altmodul. */
export const IMPORT_ACCEPT = '.csv,.tsv,.xlsx,.xls';

/**
 * Die Art einer Datei nach ihrer Endung.
 * @param {string} fileName
 * @returns {{ kind: 'csv', ext: string }|{ kind: 'unsupported', ext: string }}
 */
export function importKind(fileName) {
  const ext = String(fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  return ext === 'csv' || ext === 'tsv' ? { kind: 'csv', ext } : { kind: 'unsupported', ext };
}

/**
 * Den Text einer Datei lesen.
 * @param {{ text: () => Promise<string> }} file
 * @returns {Promise<string>}
 */
export function readImportText(file) {
  return file.text();
}
