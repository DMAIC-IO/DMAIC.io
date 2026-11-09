/**
 * D.Mike — MSA Typ 2: Beispielform.
 *
 * Die Beispieldateien liegen in der flachen Altform (`params`,
 * `columnRefs.part|operator|measurement`). Die Spaltenbezüge des Arbeitsblatts
 * hängt der Lader nur um, wo das Model sie als Felder kennt; darum geht die
 * Altform vorher durch die Migration des Models.
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
