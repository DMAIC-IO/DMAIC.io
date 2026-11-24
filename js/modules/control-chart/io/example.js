/**
 * D.Mike — Regelkarte für Variablen: fremde Beispielformen. Rein.
 *
 * Die eigenen Beispiele haben die Form des Models und bleiben, wie sie sind.
 * Ein geteilter CSV-Datensatz (`columns`, etwa `capability-bolzendurchmesser`)
 * wird zu einem Arbeitsblatt mit der ersten Spalte als Messwertspalte; alle
 * übrigen Felder nehmen die Vorgaben des Models.
 */
import { State } from '../domain/model.js';

/**
 * Beispiel in die Form des Models übersetzen.
 * @param {Record<string, any>} data Beispielinhalt (Projekt- oder CSV-Form)
 * @param {Record<string, any>} meta Katalogeintrag (`id`, `title`)
 * @param {{ csvToWorksheet: (data: object, meta: object) => any,
 *   context?: import('../../../core/model.js').ModelContext }} helpers
 *   `csvToWorksheet`: Arbeitsblatt aus der CSV-Form; `context`: Modellkontext für die Vorgaben
 * @returns {Record<string, any>}
 */
export function fromExample(data, meta, { csvToWorksheet, context }) {
  if (!Array.isArray(data?.columns)) return data;
  const sheet = csvToWorksheet(data, meta);
  if (!sheet) throw new Error('no columns');
  return {
    ...new State(context).toJSON(),
    columnRef: { instanceId: '__source__', sheetId: sheet.activeSheetId, columnId: 'c-0' },
    sourceWorksheetData: sheet,
  };
}
