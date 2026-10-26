/**
 * D.Mike — Datenreihen eines DatasetPicker für die Agentenfläche (agent-datasets.js)
 *
 * Gegenstück zu `pickableColumnList` für Module, die ihre Spalten über
 * `DatasetPicker` wählen: die Lesemenge je
 * Slot mit DEMSELBEN Filter wie der Picker (`slotFilter`) und die Prüfung
 * der Zeilen, die `setDatasets(rows)` annimmt.
 *
 * Rein: kein DOM, kein `window`.
 */
import { refToKey, keyToRef } from '../../ui/column-picker.js';
import { slotFilter } from '../../ui/dataset-picker.js';
import { pickableColumnList } from './agent-options.js';
import { requireEnum, requireKnownId } from './agent-argcheck.js';

/**
 * Je Slot die wählbaren Spalten, wie der Picker sie diesem Slot anbietet.
 *
 * @param {object} stateManager der StateManager aus `module._context`
 * @param {{ key: string, types?: string[], minCount?: number, maxCount?: number }[]} slots
 *   die Slot-Definitionen des Pickers (`DATASET_SLOTS` des Moduls)
 * @returns {Object<string, { key: string, name: string }[]>} je Slot-Schlüssel die Spalten
 */
export function datasetSlotColumns(stateManager, slots) {
  return Object.fromEntries(slots.map(slot =>
    [slot.key, pickableColumnList(stateManager, slotFilter(slot))]));
}

/**
 * Die Zeilen für `setDatasets(rows)` prüfen und normalisieren.
 *
 * Jede Zeile ist ein Objekt `{ <slot>: ref|null }`. Ein Slot, der fehlt, ist
 * `null`; ein Bezug wird gegen die wählbaren Spalten seines Slots geprüft und
 * auf `{ instanceId, sheetId, columnId }` gekürzt. Pflichtslots werden NICHT
 * erzwungen — auch der Picker hält unvollständige Zeilen. Eine leere Liste
 * wird eine leere Zeile: der Picker zeigt nie null Zeilen.
 *
 * @param {any} rows die Zeilen, wie der Agent sie schickt
 * @param {Object<string, { key: string }[]>} pickable `read().pickableColumns`
 *   — die Slot-Schlüssel in Reihenfolge der Oberfläche
 * @returns {Object<string, object|null>[]} die normalisierten Zeilen, mindestens eine
 * @throws {Error} wenn `rows` keine Liste von Objekten ist, ein Slot unbekannt
 *   oder eine Spalte nicht wählbar
 */
export function requireDatasetRows(rows, pickable) {
  const slots = Object.keys(pickable);
  const shape = () => new Error(`invalid rows ${JSON.stringify(rows)}; allowed: a list of rows, `
    + `each { ${slots.join(', ')} } with a column reference or null; [] clears the list`);
  if (!Array.isArray(rows)) throw shape();
  const empty = () => Object.fromEntries(slots.map(s => [s, null]));
  const clean = rows.map((row) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) throw shape();
    const out = empty();
    for (const [slot, ref] of Object.entries(row)) {
      requireEnum('slot', slot, slots);
      if (ref == null) continue;
      requireKnownId('ref', refToKey(ref), pickable[slot].map(c => c.key));
      out[slot] = keyToRef(refToKey(ref));
    }
    return out;
  });
  return clean.length > 0 ? clean : [empty()];
}
