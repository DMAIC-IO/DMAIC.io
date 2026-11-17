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

/** Leser je `stateManager` (P4): `readSync` des Instanzen-Dienstes, in Tests ein Doppel. */
const readers = new WeakMap();

/** @type {((key: string) => void)|null} liest den reaktiven Zähler `key` (`'#list'` oder eine Instanz-Id) */
let touch = null;

/**
 * Den Abhängigkeits-Haken setzen: jedes Lesen ruft ihn mit der Instanz-Id, das
 * Auflisten der Spalten mit `'#list'`. `worksheet-data.js` hängt ihn an die
 * reaktiven Zähler, damit auch Altleser (Korrelation, Regression, …) in
 * Alpine-Ansichten neu rechnen, wenn das Arbeitsblatt nachgeladen wird oder
 * sich ändert.
 * Nur `core/worksheet-data.js` setzt den Haken, beim Import. Ohne diesen Import
 * (etwa in Node-Tests) bleibt er `null`, und die Fassade ist nicht reaktiv.
 * @param {((key: string) => void)|null} fn
 * @returns {((key: string) => void)|null} der bisherige Haken (zum Wiederherstellen in Tests)
 */
export function setWorksheetTouch(fn) { const prev = touch; touch = fn; return prev; }

/**
 * Das rohe Objekt hinter einem reaktiven Proxy. Ein Viewmodel reicht den
 * `stateManager` oft über Alpine weiter (`this._ui.services`); Alpines
 * Reaktivität verpackt ihn dabei in einen Proxy, der über `__v_raw` auf das
 * rohe Objekt zeigt (wie `toRaw` von `@vue/reactivity`). Ohne das fände die
 * `WeakMap` den Leser nicht.
 * @param {object} obj
 * @returns {object}
 */
function rawOf(obj) {
  let o = obj;
  while (o && typeof o === 'object' && o.__v_raw) o = o.__v_raw;
  return o;
}

/**
 * Den Arbeitsblatt-Leser für einen `stateManager` hinterlegen. Die App ruft das
 * direkt nach `createInstances` mit `instances.readSync`.
 * @param {object} stateManager
 * @param {(id: string, options?: object) => object} readSync
 * @returns {void}
 */
export function registerWorksheetReader(stateManager, readSync) {
  readers.set(rawOf(stateManager), readSync);
}

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
  const read = readers.get(rawOf(stateManager));
  if (!read) throw new Error('worksheet reader not registered');
  touch?.(instanceId);
  try {
    return read(instanceId, options) ?? null;
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
  const read = readers.get(rawOf(stateManager));
  if (!read) throw new Error('worksheet reader not registered');
  touch?.(instanceId);
  try {
    read(instanceId, PROBE);
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
  touch?.('#list');
  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    for (const inst of stateManager.get(`phases.${phase}`) ?? []) {
      if (inst?.moduleId === 'worksheet' && !worksheetReadable(stateManager, inst.instanceId)) return false;
    }
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
  const out = readWorksheet(stateManager, ref.instanceId, { sheetId: ref.sheetId, columns: [ref.columnId] });
  const c = out?.columns?.[0];
  if (!c || c.id !== ref.columnId) return null;
  return {
    id: c.id, name: c.name, shortName: c.shortName, type: c.type, unit: c.unit,
    role: c.role ?? null, roleManual: c.roleConfirmed === true,
    format: c.format, meta: c.meta, values: c.values ?? [],
  };
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
 * Serialize a column reference to a pipe-delimited key.
 * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
 * @returns {string}
 */
export function refToKey(ref) {
  return ref ? `${ref.instanceId}|${ref.sheetId}|${ref.columnId}` : '';
}

/**
 * Eine gefundene Spalte als wählbarer Eintrag: Schlüssel (`refToKey`) und Anzeigename.
 * @param {{ instanceId: string, sheetId: string, columnId: string, columnName?: string, shortName?: string }} col
 * @returns {{ key: string, name: string }}
 */
export function columnOption(col) {
  const key = refToKey(col);
  return { key, name: col.columnName || col.shortName || key };
}

/**
 * Alle Arbeitsblattspalten des Projekts, die zum Filter passen.
 * Liest über den registrierten Leser (`readWorksheet`), nicht über `getModuleState`.
 * @param {{ get: (path: string) => any }} stateManager
 * @param {{ types?: string[]|Set<string>, minCount?: number, maxCount?: number }} [filter]
 * @returns {{ instanceId: string, sheetId: string, sheetName: string, columnId: string,
 *   columnName: string, shortName: string, type: string, valueCount: number }[]}
 */
export function discoverColumns(stateManager, filter) {
  const typeSet = filter?.types
    ? (filter.types instanceof Set ? filter.types : new Set(filter.types))
    : null;
  const minCount = filter?.minCount || 0;
  const maxCount = filter?.maxCount ?? Infinity;
  const columns = [];
  touch?.('#list');

  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    const instances = stateManager.get(`phases.${phase}`) ?? [];
    for (const inst of instances) {
      if (inst.moduleId !== 'worksheet') continue;
      const head = readWorksheet(stateManager, inst.instanceId);
      for (const sheet of head?.sheets ?? []) {
        // Das erste Lesen zeigt schon das erste Blatt: dessen Kopf nicht noch einmal lesen.
        const sheetHead = sheet.id === head.sheetId
          ? head
          : readWorksheet(stateManager, inst.instanceId, { sheetId: sheet.id });
        const ids = (sheetHead?.columns ?? []).map(c => c.id);
        if (ids.length === 0) continue;
        const full = readWorksheet(stateManager, inst.instanceId, { sheetId: sheet.id, columns: ids });
        for (const col of full?.columns ?? []) {
          if (typeSet && !typeSet.has(col.type)) continue;
          let nonNull = 0;
          for (const v of col.values || []) if (v != null) nonNull++;
          if (nonNull < minCount || nonNull > maxCount) continue;
          columns.push({
            instanceId: inst.instanceId,
            sheetId: sheet.id,
            sheetName: sheet.name,
            columnId: col.id,
            columnName: col.name || '',
            shortName: col.shortName || '?',
            type: col.type,
            valueCount: nonNull,
          });
        }
      }
    }
  }
  return columns;
}
