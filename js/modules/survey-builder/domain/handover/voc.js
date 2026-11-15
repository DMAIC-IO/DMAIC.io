/**
 * D.Mike — Survey builder: Stapel der Übergabe an den VoC-Baum.
 *
 * Rein. Ohne Baum legt der Stapel einen an — ohne Phase, der Kern wählt die
 * Vorgabephase des Baums im aktiven Zyklus. Je Eintrag ein `addVoc`, zuletzt
 * der eigene Merker `markVocTaken`, alles in einem Stapel.
 */

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
    stack.push({ op: 'instance.call', module: 'voc-ctx-tree', instance, method: 'addVoc', args: [e.text, vocSource(e, sourceLabel, anonymous)] });
  }
  stack.push({ op: 'instance.call', module: 'survey-builder', instance: surveyInstanceId, method: 'markVocTaken', args: [{ keys: [...keys] }] });
  return stack;
}
