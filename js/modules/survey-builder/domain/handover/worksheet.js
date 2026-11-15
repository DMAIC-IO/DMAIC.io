/**
 * D.Mike — Survey builder: Spalten der Übergabe an ein Arbeitsblatt.
 *
 * Rein. Eine Zeile je Antwort; die Spalten liefert `worksheetColumns`
 * aus den Antworten in der früheren Form.
 */
import { worksheetColumns } from '../stats.js';
import { legacyResponses } from '../answers.js';

/**
 * Die Spalten des Arbeitsblatts zu allen Antworten, ohne Filter.
 * @param {{ survey: object, responses: ReadonlyArray<Record<string, any>>, recipients: ReadonlyArray<{ id: string, name: string }> }} data
 *   die Daten des Models (Antworten in der gespeicherten Form)
 * @param {{ responseId: string, submittedAt: string, recipient: string, other: string, functional: string,
 *   dysfunctional: string, importance: string, category: string, question: string }} strings Spaltennamen
 * @returns {Array<{ name: string, type: 'numeric'|'text', role: string, values: Array<number|string|null> }>}
 */
export function worksheetColumnsFor(data, strings) {
  return worksheetColumns(data.survey, legacyResponses(data), [...data.recipients], strings);
}
