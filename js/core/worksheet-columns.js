/**
 * D.Mike — Worksheet Column Access Core (worksheet-columns.js)
 *
 * The single shared implementation of the "turn a worksheet column reference
 * into data" core that several analysis modules need:
 *
 *   1. resolveColumnRef — resolve a `{instanceId, sheetId, columnId}` ref against
 *      a stateManager to the column object (or null if any hop is missing).
 *      Reads only through the worksheet reader registered per stateManager
 *      (`registerWorksheetReader`, in the app `instances.readSync`), never
 *      through `getModuleState`.
 *   2. getColumnRawValues — the column's raw cell-value array (rowCount
 *      entries, missing cells null; [] only if the reference is unresolved).
 *   3. coerceNumeric — the plain, type-agnostic cell→number coercion shared by
 *      consumers that just want "a number or nothing" (empty/null/unparseable
 *      → null; numeric strings are parsed). NOTE: this is the *plain* coercion.
 *      Modules with type-aware coercion (e.g. correlation's date/time handling)
 *      keep their own variant — those semantics genuinely differ and are not
 *      forced into this helper.
 *
 * This is the low-level data-access layer that sits *under* the per-module
 * row-filter / alignment logic (correlation's pairwise null-alignment,
 * glm's drop-missing-predictor filter, …). Each module keeps its own filter;
 * only this common core is shared.
 *
 * `column-picker.js`'s `getColumnValues` / `getColumnName` build on this so the
 * worksheet-resolution walk exists in exactly one place.
 */

import { registerReader, createSource, setTouchHook } from './source-reader.js';
import { readColumn, refToKey, columnOption, listColumns } from './source-columns.js';

export { refToKey, columnOption };

/**
 * Den Abhängigkeits-Haken setzen: jedes Lesen ruft ihn mit der Instanz-Id, das
 * Auflisten der Spalten mit `'#list'`. `core/source.js` hängt ihn beim Import
 * an die reaktiven Zähler, damit auch Altleser (Korrelation, Regression, …) in
 * Alpine-Ansichten neu rechnen, wenn das Arbeitsblatt nachgeladen wird oder
 * sich ändert. Ohne diesen Import (etwa in Node-Tests) bleibt er `null`, und
 * die Fassade ist nicht reaktiv.
 * @param {((key: string) => void)|null} fn
 * @returns {((key: string) => void)|null} der bisherige Haken (zum Wiederherstellen in Tests)
 */
export const setWorksheetTouch = setTouchHook;

/**
 * Den Arbeitsblatt-Leser für einen `stateManager` hinterlegen (Name der
 * Fassade; dasselbe wie `registerReader` aus `core/source.js`).
 * @param {object} stateManager
 * @param {(id: string, options?: object) => object} readSync
 * @returns {void}
 */
export const registerWorksheetReader = registerReader;

/**
 * Ein Arbeitsblatt über den registrierten Leser lesen (Form von `read`, P3).
 * Jeder Fehler des Lesers (`not_loaded`, unbekannte Instanz, Blatt oder
 * Spalte) ergibt `null`.
 * @param {object} stateManager
 * @param {string} instanceId
 * @param {object} [options]  Leseoptionen (`sheetId`, `columns`, `fields`, …)
 * @returns {object|null}
 * @throws {Error} `worksheet reader not registered` — Programmierfehler, soll laut sein
 */
export function readWorksheet(stateManager, instanceId, options) {
  const src = createSource(stateManager);
  try {
    return src.read(instanceId, options) ?? null;
  } catch {
    return null;
  }
}

/** Der billigste Lesevorgang: keine Spalten, keine Zeilen, nur Blattliste und `rowCount`. */
const PROBE = Object.freeze({ columns: Object.freeze([]) });

/**
 * Ist das Ergebnis der Fassade für diese Instanz verlässlich? `false` genau
 * dann, wenn der Leser `not_loaded` meldet: der Code des Arbeitsblatts ist
 * (noch) nicht geladen, etwa im Vorladefenster nach dem Neuladen oder nach
 * einem gescheiterten Laden. Dann heißt `null`/`[]` der Fassade „weiß ich
 * nicht", nicht „gibt es nicht". Wer aus einem leeren Ergebnis etwas
 * schreibt (eine Auswahl verwerfen, ein neues Blatt anlegen), fragt vorher
 * hier. Eine unbekannte Instanz ist lesbar: ihr `null` ist verlässlich.
 * @param {object} stateManager
 * @param {string} instanceId
 * @returns {boolean}
 * @throws {Error} `worksheet reader not registered`
 */
export function worksheetReadable(stateManager, instanceId) {
  const src = createSource(stateManager);
  try {
    src.read(instanceId, PROBE);
    return true;
  } catch (err) {
    return err?.code !== 'not_loaded';
  }
}

/**
 * Sind alle Arbeitsblätter des Projekts lesbar (`worksheetReadable`)? Ohne
 * Arbeitsblatt `true`. Für Leser über alle Blätter (`discoverColumns`,
 * `ColumnPicker`). Reaktiv wie `discoverColumns` (`'#list'`): nach dem
 * Vorladen rechnet ein `computed` neu.
 * @param {{ get: (path: string) => any }} stateManager
 * @returns {boolean}
 * @throws {Error} `worksheet reader not registered`
 */
export function worksheetsReadable(stateManager) {
  const src = createSource(stateManager);
  for (const inst of src.list()) {
    if (inst.moduleId === 'worksheet' && !worksheetReadable(stateManager, inst.instanceId)) return false;
  }
  return true;
}

/**
 * Resolve a column reference to its worksheet column object, read through
 * the registered reader (`readSync`, with `columns: [columnId]`).
 * Returns null when the reference has no `sheetId` or the worksheet instance,
 * sheet, or column is missing (or the worksheet module is not loaded yet).
 * @param {object} stateManager
 * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
 * @returns {{ id: string, name: string, shortName: string, type: string, unit: string|null,
 *   role: string|null, roleManual: boolean, format: object, meta: object|null, values: any[] }|null}
 */
export function resolveColumnRef(stateManager, ref) {
  if (!ref || !stateManager) return null;
  if (typeof ref.instanceId !== 'string' || typeof ref.sheetId !== 'string' || typeof ref.columnId !== 'string') {
    return null;
  }
  const c = readColumn(createSource(stateManager), ref);
  if (!c) return null;
  const { roleConfirmed, ...rest } = c;
  return { ...rest, roleManual: roleConfirmed };
}

/**
 * Read the raw cell values of a column reference.
 * @param {object} stateManager
 * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
 * @returns {any[]} the column's `values` array (`rowCount` entries, missing
 *   cells `null`); empty only if the reference is unresolved
 */
export function getColumnRawValues(stateManager, ref) {
  const col = resolveColumnRef(stateManager, ref);
  return col ? (col.values || []) : [];
}

/**
 * Plain, type-agnostic cell→number coercion.
 * empty / whitespace-only / null / non-finite → null; numeric strings are parsed.
 * @param {*} val
 * @returns {number|null}
 */
export function coerceNumeric(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && !isNaN(val)) return val;
  // Number(' ') is 0 — a blanked cell must not become a measurement.
  if (typeof val === 'string' && val.trim() === '') return null;
  const n = Number(val);
  return isFinite(n) ? n : null;
}

/**
 * Alle Arbeitsblattspalten des Projekts, die zum Filter passen.
 * Liest über den registrierten Leser (`readWorksheet`), nur Köpfe (`valueCount`), keine Werte.
 * @param {{ get: (path: string) => any }} stateManager
 * @param {{ types?: string[]|Set<string>, minCount?: number, maxCount?: number }} [filter]
 * @returns {{ instanceId: string, sheetId: string, sheetName: string, columnId: string,
 *   columnName: string, shortName: string, type: string, valueCount: number }[]}
 */
export function discoverColumns(stateManager, filter) {
  return listColumns(createSource(stateManager), filter);
}
