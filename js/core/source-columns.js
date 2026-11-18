/**
 * D.Mike — Reine Spaltenfunktionen über den Leser `Source` (source-columns.js)
 *
 * Alles, was aus `src.read` Spalten, Köpfe und Werte macht. Ohne Alpine, ohne
 * Zustand: jede Funktion bekommt den Leser (`core/source.js`) und liest bei
 * Bedarf. Ein Fehler des Lesers (`not_loaded`, `unknown_instance`,
 * `unknown_sheet`, `unknown_column`) ergibt `null` (bzw. eine leere Liste).
 * Ein Spaltenbezug ohne `sheetId` ist nicht auflösbar.
 */
import { parseNumeric } from './datagrid/datagrid-utils.js';

/**
 * @typedef {import('./source-reader.js').Source} Source
 * @typedef {{ instanceId: string, sheetId?: string, columnId: string }} ColumnRef
 */

/**
 * Eine Spaltenreferenz als Schlüssel `instanceId|sheetId|columnId`.
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
 * Lesen, Fehler des Lesers ergeben `null`.
 * @param {Source} src
 * @param {string} instanceId
 * @param {object} [options]
 * @returns {object|null}
 */
function tryRead(src, instanceId, options) {
  try {
    return src.read(instanceId, options) ?? null;
  } catch {
    return null;
  }
}

/**
 * Eine Spalte mit Kopf und Werten lesen (`read` mit `columns: [columnId]`).
 * `null`, wenn der Bezug kein `sheetId` hat oder Instanz, Blatt oder Spalte
 * fehlen (oder das Arbeitsblatt-Modul noch nicht geladen ist).
 * @param {Source} src
 * @param {ColumnRef|null} ref
 * @returns {{ id: string, name: string, shortName: string, type: string, unit: string|null,
 *   role: string|null, roleConfirmed: boolean, format: object, meta: object|null, values: any[] }|null}
 */
export function readColumn(src, ref) {
  if (!ref || typeof ref.instanceId !== 'string' || typeof ref.sheetId !== 'string' || typeof ref.columnId !== 'string') {
    return null;
  }
  const out = tryRead(src, ref.instanceId, { sheetId: ref.sheetId, columns: [ref.columnId] });
  const c = out?.columns?.[0];
  if (!c || c.id !== ref.columnId) return null;
  return {
    id: c.id, name: c.name, shortName: c.shortName, type: c.type, unit: c.unit,
    role: c.role ?? null, roleConfirmed: c.roleConfirmed === true,
    format: c.format, meta: c.meta, values: c.values ?? [],
  };
}

/**
 * Anzeigename einer Spalte: `name || shortName || '?'`.
 * @param {{ name?: string, shortName?: string }} col
 * @returns {string}
 */
export function columnLabel(col) { return col.name || col.shortName || '?'; }

/**
 * Die Zahlen einer Werteliste wie im Arbeitsblatt (`parseNumeric`): Dezimalkomma
 * zählt; Wahrheitswerte, Leerwerte, Text und `Infinity` fallen heraus.
 * @param {any[]} values
 * @returns {number[]}
 */
export function numericValues(values) {
  return values.map((v) => (typeof v === 'boolean' ? null : parseNumeric(v))).filter((v) => v !== null && Number.isFinite(v));
}

/**
 * Zeilenzahl und Spaltenköpfe eines Blatts.
 * @param {Source} src
 * @param {{ instanceId: string, sheetId: string }|null} ref
 * @returns {{ id: string, name: string, rowCount: number, columns: { id: string, name: string, type: string, meta: object|null }[] }|null}
 */
export function readSheet(src, ref) {
  if (!ref || typeof ref.instanceId !== 'string' || typeof ref.sheetId !== 'string') return null;
  const out = tryRead(src, ref.instanceId, { sheetId: ref.sheetId });
  if (!out || out.sheetId !== ref.sheetId) return null;
  const sh = (out.sheets ?? []).find((x) => x.id === ref.sheetId);
  if (!sh) return null;
  return {
    id: sh.id, name: sh.name, rowCount: out.rowCount ?? 0,
    // `meta` ist im Lesen schon eine Kopie.
    columns: (out.columns ?? []).map((c) => ({ id: c.id, name: columnLabel(c), type: c.type, meta: c.meta ?? null })),
  };
}

/**
 * Die Blätter einer Arbeitsblatt-Instanz mit Zeilenzahl. Hängt auch an die
 * Instanzliste (`src.list()`), damit ein neues Arbeitsblatt die Antwort ändert.
 * @param {Source} src
 * @param {string|null} instanceId
 * @returns {{ id: string, name: string, rowCount: number }[]|null}
 */
export function readSheets(src, instanceId) {
  src.list();
  if (typeof instanceId !== 'string') return null;
  const head = tryRead(src, instanceId, { fields: ['sheets'] });
  if (!head?.sheets) return null;
  // Je Blatt ein Lesen mit `sheetId`: `rowCount` steht nur am gezeigten Blatt.
  return head.sheets.map((sh) => ({
    id: sh.id, name: sh.name,
    rowCount: tryRead(src, instanceId, { sheetId: sh.id })?.rowCount ?? 0,
  }));
}

/**
 * Alle Arbeitsblattspalten des Projekts, die zum Filter passen. Liest nur
 * Köpfe (`valueCount` im Kopf), keine Werte.
 * @param {Source} src
 * @param {{ types?: string[]|Set<string>, minCount?: number, maxCount?: number }} [filter]
 * @returns {{ instanceId: string, sheetId: string, sheetName: string, columnId: string,
 *   columnName: string, shortName: string, type: string, valueCount: number }[]}
 */
export function listColumns(src, filter) {
  const typeSet = filter?.types
    ? (filter.types instanceof Set ? filter.types : new Set(filter.types))
    : null;
  const minCount = filter?.minCount || 0;
  const maxCount = filter?.maxCount ?? Infinity;
  const columns = [];

  for (const inst of src.list()) {
    if (inst.moduleId !== 'worksheet') continue;
    const head = tryRead(src, inst.instanceId);
    for (const sheet of head?.sheets ?? []) {
      // Das erste Lesen zeigt schon das erste Blatt: dessen Kopf nicht noch einmal lesen.
      const sheetHead = sheet.id === head.sheetId ? head : tryRead(src, inst.instanceId, { sheetId: sheet.id });
      for (const col of sheetHead?.columns ?? []) {
        if (typeSet && !typeSet.has(col.type)) continue;
        const nonNull = col.valueCount ?? 0;
        if (nonNull < minCount || nonNull > maxCount) continue;
        columns.push({
          instanceId: inst.instanceId, sheetId: sheet.id, sheetName: sheet.name,
          columnId: col.id, columnName: col.name || '', shortName: col.shortName || '?',
          type: col.type, valueCount: nonNull,
        });
      }
    }
  }
  return columns;
}

/**
 * Wählbare Spalten als `{ key, name }`.
 * @param {Source} src
 * @param {{ types?: string[]|Set<string>, minCount?: number, maxCount?: number }} [filter]
 * @returns {{ key: string, name: string }[]}
 */
export function columnOptions(src, filter) {
  return listColumns(src, filter ?? {}).map(columnOption);
}
