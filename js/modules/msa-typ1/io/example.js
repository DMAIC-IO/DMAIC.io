/**
 * D.Mike — MSA Typ 1: Beispielform.
 *
 * Die Beispieldateien liegen in der Altform (`params` als Text,
 * `columnRef` mit Platzhalter). Die Spaltenbezüge hängt der Lader nur um, wo
 * das Model sie als Felder kennt; darum geht die Altform vorher durch die
 * Migration des Models.
 */
import { State } from '../domain/model.js';

/**
 * Beispiel in die Form des Models übersetzen; das Arbeitsblatt bleibt daneben.
 * @param {Record<string, any>} data Beispielinhalt (Altform oder Form des Models)
 * @returns {Record<string, any>}
 */
export function fromExample(data) {
  const { sourceWorksheetData, ...rest } = data;
  const model = State.fromJSON(rest).toJSON();
  return sourceWorksheetData ? { ...model, sourceWorksheetData } : model;
}
