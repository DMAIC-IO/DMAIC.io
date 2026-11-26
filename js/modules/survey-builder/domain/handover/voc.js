/**
 * D.Mike — Survey builder: Stapel der Übergabe an den VoC-Baum.
 *
 * Rein. Ohne Baum legt der Stapel einen an — ohne Phase, der Kern wählt die
 * Vorgabephase des Baums im aktiven Zyklus. Je Eintrag ein `addVoc`, zuletzt
 * der eigene Merker `markVocTaken`, alles in einem Stapel. `openTexts` nennt
 * die Antworten, die sich übernehmen lassen.
 */
import { documentOrder, isVisible } from '../conditions.js';
import { otherKey } from '../stats.js';
import { recipientName } from '../labels.js';
import { legacyResponses } from '../answers.js';

/**
 * @typedef {{ op: 'module.add', id: string, module: string, phase?: string }} AddOp
 * @typedef {{ op: 'instance.call', id?: string, module: string,
 *   instance: string|{ $from: string, path: string }, method: string, args: any[] }} CallOp
 */

/**
 * Herkunft einer Kundenstimme: die Umfrage, ohne Anonymität mit dem Namen.
 * @param {{ name: string }} entry
 * @param {string} sourceLabel z. B. „Umfrage: Kundenbefragung“
 * @param {boolean} anonymous
 * @returns {string}
 */
function vocSource(entry, sourceLabel, anonymous) {
  return !anonymous && entry.name ? `${sourceLabel}, ${entry.name}` : sourceLabel;
}

/**
 * Der Stapel, der Freitexte als Kundenstimmen in den VoC-Baum übernimmt.
 * @param {{ treeId: string|null, entries: ReadonlyArray<{ text: string, name: string }>, sourceLabel: string,
 *   anonymous: boolean, surveyInstanceId: string, keys: ReadonlyArray<string> }} input
 *   `treeId` der erste Baum des Projekts oder `null` für einen neuen; `keys`
 *   die Antwortschlüssel der Einträge für `markVocTaken`
 * @returns {Array<AddOp|CallOp>}
 */
export function vocStack({ treeId, entries, sourceLabel, anonymous, surveyInstanceId, keys }) {
  /** @type {Array<AddOp|CallOp>} */
  const stack = [];
  const instance = treeId ?? { $from: 'tree', path: 'instanceId' };
  if (!treeId) stack.push({ op: 'module.add', id: 'tree', module: 'voc-ctx-tree' });
  for (const e of entries) {
    stack.push({ op: 'instance.call', module: 'voc-ctx-tree', instance, method: 'addVoc', args: [{ text: e.text, source: vocSource(e, sourceLabel, anonymous) }] });
  }
  stack.push({ op: 'instance.call', module: 'survey-builder', instance: surveyInstanceId, method: 'markVocTaken', args: [{ keys: [...keys] }] });
  return stack;
}

/**
 * Jeder nicht leere Freitext und „Sonstige“-Text aller Antworten, ohne
 * Filter, nur aus sichtbaren Fragen.
 * @param {{ survey: any, responses: ReadonlyArray<Record<string, any>>, recipients: ReadonlyArray<{ id: string, name: string }> }} data
 *   die Daten des Models (Antworten in der gespeicherten Form)
 * @returns {Map<string, { text: string, name: string }>} Antwortschlüssel → Text und Name der Antwortenden
 */
export function openTexts(data) {
  /** @type {Map<string, { text: string, name: string }>} */
  const map = new Map();
  const recipients = [...data.recipients];
  for (const resp of legacyResponses(data)) {
    const name = recipientName(recipients, resp.recipientId) || '';
    for (const { question: q } of documentOrder(data.survey)) {
      if (!isVisible(q, resp.answers, data.survey)) continue;
      const a = resp.answers[q.id];
      if (q.type === 'text') {
        const text = typeof a === 'string' ? a.trim() : '';
        if (text) map.set(otherKey(resp.id, q.id), { text, name });
      } else if ((q.type === 'single' || q.type === 'multi') && a && typeof a === 'object') {
        const text = typeof a.other === 'string' ? a.other.trim() : '';
        if (text) map.set(otherKey(resp.id, q.id, true), { text, name });
      }
    }
  }
  return map;
}
