/**
 * D.Mike — Arbeitsblatt: Kommandos für die Struktur (domain/commands-structure.js)
 *
 * Spalten (`addColumn`, `removeColumn`, `renameColumn`, `moveColumn`),
 * Spaltenmerkmale (`setColumnMeta`, `setColumnRole`, `setColumnType`,
 * `setColumnFormat`), Zeilen (`addRows`, `removeRows`, `moveRow`) und
 * `sortRows`. Prüfungen und Meldungen wörtlich aus den heutigen
 * Agentenaktionen (`worksheet.js`), die Wirkung wie `DataGrid` (Kurznamen
 * C1… folgen der Reihenfolge, Formeln wandern mit ihrer Zeile; positionale
 * Bezüge (`C2`, `C2[5]`, `C1:C3`) folgen Verschieben, Einfügen und Entfernen
 * ihrer Spalte, ein Bezug auf eine entfernte Spalte wird `#REF!`; Umbenennen
 * schreibt Namensbezüge um).
 *
 * Jedes Kommando prüft alles, bevor es schreibt, sammelt seine Umkehrung
 * (`recordInverse`), setzt Formelzeilen mit `remapFormulaRows` um, rechnet
 * die Formeln (`recalcFormulas`) und meldet die Tabelle genau einmal als
 * geändert. Ohne Wirkung passiert nichts. Spaltenmerkmale und Umbenennen
 * schreiben über `commit` (Zellkommandos), Umkehrung `restoreCells`.
 * Umkehr-Kommandos, die nur der Verlauf ruft: `restoreColumn`,
 * `restoreRows`, `applyRowPermutation` (Parameter mit
 * `agentWrite: false`).
 *
 * Rein: kein DOM, kein i18n.
 */
import {
  command, text, number, boolean, list, object, map, oneOf, cell, unchecked, checkValue,
  recordInverse, markTableChanged,
} from '../../../core/model.js';
import { requireIndex, requireNumber, requireEnum, requireForm } from '../../../core/validate.js';
import { DATE_FORMATS, TIME_FORMATS } from '../../../core/datagrid/datagrid-utils.js';
import { defaultRoleForType, isRoleValidForType, validRolesForType } from '../../../core/datagrid/datagrid-roles.js';
import {
  insertRows, deleteRows, moveRowData, insertColumn, deleteColumn, moveColumnData,
  sortPermutation, applyPermutation, invertPermutation, convertColumn,
} from '../../../core/datagrid/table/ops.js';
import { remapColumnRefs, REF_ERROR } from '../../../core/datagrid/datagrid-formula.js';
import { recalcFormulas, remapFormulaRows, renameInFormulas } from '../../../core/datagrid/table/formulas.js';
import { reinferRoleAfterRetype } from '../../../core/worksheet-write.js';
import { isCell } from '../../../core/table-data.js';
import { uid } from '../../../core/uid.js';
import { COLUMN_SHAPE, fitsType, checkColumnMeta, FORMAT_KEYS_BY_TYPE } from './columns.js';
import { sheetOf, columnIndex, requireUnlocked, copyHead, changedRun, commit } from './commands-cells.js';

/** Zeilen, die `addRows` ohne `count` anfügt (wie der Knopf der Leiste). */
export const DEFAULT_ADD_ROWS = 10;

const hidden = { agentWrite: false };
const hiddenOptional = { agentWrite: false, optional: true };

// ─── Hilfen ──────────────────────────────────────────────────────

/** @param {number} i @returns {string} der Kurzname an Position `i` */
const shortNameAt = (i) => `C${i + 1}`;

/**
 * Kurznamen der Reihenfolge nach (wie `DataGrid._reassignShortNames`).
 * @param {any[]} heads
 */
function reassignShortNames(heads) {
  heads.forEach((h, i) => { h.shortName = shortNameAt(i); });
}

/**
 * Einsbasierte Position jeder Spalte (`index + 1`; die Formel-Engine löst
 * `C<n>` über den Index auf) — vor einer Spaltenänderung genommen.
 * @param {any} sheet @returns {Map<string, number>}
 */
function positionsOf(sheet) {
  return new Map(sheet.columns.map((/** @type {any} */ h, /** @type {number} */ i) => [h.id, i + 1]));
}

/**
 * Positionale Spaltenbezüge aller Formeln des Blatts umschreiben, nachdem
 * Spalten ihren Platz wechselten. Eine Spalte, die es nicht mehr gibt
 * (`removedCol`), wird `#REF!`; eine Position ohne Spalte bleibt stehen.
 * @param {any} sheet @param {Map<string, number>} oldPos aus `positionsOf`
 * @param {{ removedCol?: string }} [opts]
 * @returns {Record<string, Record<string, string>>} Texte vor dem Umschreiben,
 *   nur geänderte Formeln
 */
function remapAfterReorder(sheet, oldPos, { removedCol } = {}) {
  /** @type {Map<number, string>} */
  const idAt = new Map([...oldPos].map(([id, pos]) => [pos, id]));
  const newPos = positionsOf(sheet);
  const mapCol = (/** @type {number} */ old) => {
    const id = idAt.get(old);
    if (id === undefined) return null;
    if (id === removedCol) return REF_ERROR;
    return newPos.get(id) ?? null;
  };
  /** @type {Record<string, Record<string, string>>} */
  const before = {};
  for (const [columnId, rows] of Object.entries(sheet.formulas)) {
    for (const [row, f] of Object.entries(/** @type {Record<string, string>} */ (rows))) {
      const next = remapColumnRefs(f, mapCol);
      if (next === f) continue;
      (before[columnId] ??= {})[row] = f;
      /** @type {any} */ (rows)[row] = next;
    }
  }
  return before;
}

/**
 * Kopien der Köpfe, deren Kurzname nicht `C<Position>` ist — vor einer
 * Spaltenänderung genommen. Die Umkehrung einer Spaltenänderung stellt die
 * Reihenfolge her und nummeriert neu; diese Köpfe setzt danach `restoreCells`.
 * @param {any} sheet @returns {{ index: number, head: any }[]}
 */
function offShortNames(sheet) {
  const out = [];
  sheet.columns.forEach((/** @type {any} */ h, /** @type {number} */ i) => {
    if (h.shortName !== shortNameAt(i)) out.push({ index: i, head: copyHead(h) });
  });
  return out;
}

/**
 * Sammelt das Zurücksetzen der Kurznamen. Vor der eigentlichen Umkehrung
 * sammeln: Rückgängig führt rückwärts aus, die Namen kommen also zuletzt.
 * @param {any} model @param {any} sheet
 * @param {{ index: number, head: any }[]} off aus `offShortNames`
 * @param {number} columnCount Spaltenzahl vor der Änderung
 */
function recordShortNames(model, sheet, off, columnCount) {
  if (off.length === 0) return;
  recordInverse(model, { type: 'restoreCells', sheetId: sheet.id, rowCount: sheet.data.rowCount, columnCount, cols: off });
}

/**
 * Formeln rechnen, Tabelle genau einmal als geändert melden.
 * @param {any} model @param {any} sheet
 */
function done(model, sheet) {
  recalcFormulas(sheet.columns, sheet.data, sheet.formulas);
  markTableChanged(model, sheet.data);
}

/**
 * Eine Spalte einfügen (Kopf, Zellen, Formeln) und neu nummerieren.
 * @param {any} sheet @param {number} at @param {any} head
 * @param {any[]|undefined} values @param {Record<string, string>|undefined} formulas
 */
function insertColumnAt(sheet, at, head, values, formulas) {
  sheet.columns.splice(at, 0, head);
  insertColumn(sheet.data, at, values);
  if (formulas && Object.keys(formulas).length) sheet.formulas[head.id] = { ...formulas };
  reassignShortNames(sheet.columns);
}

/**
 * Formeln einer Liste weggefallener Zellen je Spalte.
 * @param {{ columnId: string, row: number, formula: string }[]} dropped
 * @returns {Record<string, Record<string, string>>}
 */
function groupFormulas(dropped) {
  /** @type {Record<string, Record<string, string>>} */
  const out = {};
  for (const { columnId, row, formula } of dropped) (out[columnId] ??= {})[row] = formula;
  return out;
}

/**
 * Zeilen nach einer Permutation ordnen (`neu[i] = alt[perm[i]]`), Formeln mit.
 * @param {any} sheet @param {number[]} perm
 * @returns {number[]} die Umkehrpermutation
 */
function permuteRows(sheet, perm) {
  applyPermutation(sheet.data, perm);
  const inv = invertPermutation(perm);
  remapFormulaRows(sheet.formulas, (r) => inv[r]);
  return inv;
}

/**
 * Wohin eine Zeile wandert, wenn `from` nach `to` zieht.
 * @param {number} from @param {number} to @returns {(r: number) => number}
 */
function moveMap(from, to) {
  return (r) => {
    if (r === from) return to;
    if (from < to && r > from && r <= to) return r - 1;
    if (from > to && r >= to && r < from) return r + 1;
    return r;
  };
}

/**
 * Ein eindeutiger Spaltenname (wie `DataGrid._uniqueColumnName`).
 * @param {any[]} heads @param {string} name @param {string} selfId @returns {string}
 */
function uniqueColumnName(heads, name, selfId) {
  if (!name) return name;
  const others = heads.filter((h) => h.id !== selfId).map((h) => h.name).filter(Boolean);
  if (!others.includes(name)) return name;
  let n = 2;
  while (others.includes(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

/**
 * Den Kopf einer Spalte über `commit` ersetzen (Umkehrung `restoreCells`).
 * Gleicher Kopf: nichts.
 * @param {any} model @param {any} sheet @param {number} ci @param {any} head
 * @param {{ start: number, values: any[] }|null} [run] geänderte Zellen
 */
function commitHead(model, sheet, ci, head, run = null) {
  const same = JSON.stringify(head) === JSON.stringify(sheet.columns[ci]);
  if (same && !run) return;
  commit(model, sheet, {
    rowCount: sheet.data.rowCount,
    columnCount: sheet.columns.length,
    cols: [{ index: ci, ...(same ? {} : { head }), ...(run ?? {}) }],
  });
}

// ─── Kommandos ───────────────────────────────────────────────────

export const structureCommands = {
  /**
   * Eine leere Zahlenspalte einfügen, ohne Position am Ende. Die Kurznamen
   * (C1, …) folgen der Reihenfolge, Formelbezüge auf Spalten dahinter rücken mit. Liefert die id der neuen Spalte.
   */
  addColumn: command({
    params: { sheetId: text(), position: number({ optional: true }) },
    returns: text(),
    run({ sheetId, position }) {
      const sheet = sheetOf(this, sheetId);
      const count = sheet.columns.length;
      if (position !== undefined) requireIndex('position', position, count);
      const at = position ?? count;
      const head = {
        id: uid(), name: '', shortName: '', type: 'numeric', unit: null,
        role: defaultRoleForType('numeric'), roleManual: false, format: {}, meta: null,
      };
      const off = offShortNames(sheet);
      const oldPos = positionsOf(sheet);
      insertColumnAt(sheet, at, head, undefined, undefined);
      if (position !== undefined) remapAfterReorder(sheet, oldPos);
      recordShortNames(this, sheet, off, count);
      recordInverse(this, { type: 'removeColumn', sheetId, columnId: head.id });
      done(this, sheet);
      return head.id;
    },
  }),

  /**
   * Eine Spalte samt Werten und Formeln entfernen; Formelbezüge auf spätere
   * Spalten rücken nach, Bezüge auf die entfernte werden `#REF!`. Eine harte Sperre lehnt
   * ab, eine weiche nicht (wie das Kopfmenü).
   */
  removeColumn: command({
    params: { sheetId: text(), columnId: text() },
    run({ sheetId, columnId }) {
      const sheet = sheetOf(this, sheetId);
      const ci = columnIndex(sheet, columnId);
      const head = sheet.columns[ci];
      if (head.meta?.lock === 'hard') throw new Error(`column "${columnId}" is locked (hard)`);
      const count = sheet.columns.length;
      const off = offShortNames(sheet);
      const oldPos = positionsOf(sheet);
      sheet.columns.splice(ci, 1);
      const values = deleteColumn(sheet.data, ci);
      const formulas = sheet.formulas[columnId] ?? {};
      delete sheet.formulas[columnId];
      reassignShortNames(sheet.columns);
      const otherFormulas = remapAfterReorder(sheet, oldPos, { removedCol: columnId });
      recordShortNames(this, sheet, off, count);
      recordInverse(this, { type: 'restoreColumn', sheetId, index: ci, head: copyHead(head), values, formulas, otherFormulas });
      done(this, sheet);
    },
  }),

  /**
   * Eine Spalte umbenennen. Formeln, die den alten Namen nennen ('Name'[r]),
   * werden umgeschrieben; ein Name, den eine andere Spalte schon trägt,
   * bekommt einen Zusatz (" (2)"); "" löscht den Namen, Formeln nennen dann
   * den Kurznamen. Jede Sperre lehnt ab. Liefert den Namen, den die Spalte
   * danach trägt.
   */
  renameColumn: command({
    params: { sheetId: text(), columnId: text(), name: text() },
    returns: text(),
    run({ sheetId, columnId, name }) {
      const sheet = sheetOf(this, sheetId);
      const ci = columnIndex(sheet, columnId);
      const head = sheet.columns[ci];
      requireUnlocked(head);
      const unique = uniqueColumnName(sheet.columns, name, columnId);
      if (unique === head.name) return unique;
      // Nur Spalten mit einem Treffer kopieren; Formelschlüssel ohne Spalte bleiben unberührt.
      const indexOf = new Map(sheet.columns.map((/** @type {any} */ h, /** @type {number} */ i) => [h.id, i]));
      /** @type {Record<string, Record<string, string>>} */
      const next = {};
      if (head.name) {
        const quoted = `'${head.name}'`;
        for (const [id, byRow] of Object.entries(sheet.formulas)) {
          if (!indexOf.has(id)) continue;
          if (Object.values(byRow).some((f) => typeof f === 'string' && f.includes(quoted))) next[id] = { ...byRow };
        }
      }
      const rewritten = head.name ? renameInFormulas(next, head.name, unique, head.shortName) : [];
      /** @type {Map<number, any>} */ const byIndex = new Map([[ci, { index: ci, head: { ...copyHead(head), name: unique } }]]);
      for (const { columnId: id, row } of rewritten) {
        const i = indexOf.get(id);
        if (i === undefined) continue;
        if (!byIndex.has(i)) byIndex.set(i, { index: i });
        const e = byIndex.get(i);
        (e.formulas ??= {})[row] = next[id][row];
      }
      commit(this, sheet, { rowCount: sheet.data.rowCount, columnCount: sheet.columns.length, cols: [...byIndex.values()] });
      return unique;
    },
  }),

  /**
   * Eine Spalte verschieben, wie das Ziehen ihres Kopfs; `toIndex` ist ihre
   * Position danach. Die Kurznamen und die Formelbezüge folgen. Liefert false, wenn die Spalte
   * schon dort steht.
   */
  moveColumn: command({
    params: { sheetId: text(), columnId: text(), toIndex: number() },
    returns: boolean(),
    run({ sheetId, columnId, toIndex }) {
      const sheet = sheetOf(this, sheetId);
      const from = columnIndex(sheet, columnId);
      const count = sheet.columns.length;
      requireIndex('toIndex', toIndex, count, { existing: true });
      if (from === toIndex) return false;
      const off = offShortNames(sheet);
      const oldPos = positionsOf(sheet);
      const [head] = sheet.columns.splice(from, 1);
      sheet.columns.splice(toIndex, 0, head);
      moveColumnData(sheet.data, from, toIndex);
      reassignShortNames(sheet.columns);
      remapAfterReorder(sheet, oldPos);
      recordShortNames(this, sheet, off, count);
      recordInverse(this, { type: 'moveColumn', sheetId, columnId, toIndex: from });
      done(this, sheet);
      return true;
    },
  }),

  /**
   * Das ganze Merkmal einer Spalte setzen: Sperre, Grund, verwaltendes Modul,
   * kategoriale Kodierung; `null` entfernt es. Auch auf gesperrten Spalten,
   * damit eine Sperre um einen Schreibzugriff aufgehoben und wieder gesetzt
   * werden kann. Ein `null`-Wert in `meta` wird abgelehnt.
   */
  setColumnMeta: command({
    params: {
      sheetId: text(),
      columnId: text(),
      meta: unchecked({ type: "{ lock?: 'hard'|'soft', reason?: string, managedBy?: string, managedRef?: string, categoricalCoding?: Record<string, number> }|null" }),
    },
    run({ sheetId, columnId, meta }) {
      const sheet = sheetOf(this, sheetId);
      const ci = columnIndex(sheet, columnId);
      const next = checkValue(COLUMN_SHAPE.meta, 'meta', checkColumnMeta(meta));
      commitHead(this, sheet, ci, { ...copyHead(sheet.columns[ci]), meta: next });
    },
  }),

  /**
   * Die Rolle einer Spalte setzen oder die erkannte bestätigen (dieselbe
   * Rolle noch einmal); danach gilt sie als von Hand gesetzt. Die Rolle muss
   * zum Spaltentyp passen; jede Sperre lehnt ab.
   */
  setColumnRole: command({
    params: { sheetId: text(), columnId: text(), role: oneOf(['continuous', 'categorical', 'ordinal', 'date', 'identifier', 'freeText']) },
    run({ sheetId, columnId, role }) {
      const sheet = sheetOf(this, sheetId);
      const ci = columnIndex(sheet, columnId);
      const head = sheet.columns[ci];
      if (!isRoleValidForType(role, head.type)) {
        throw new Error(
          `invalid role ${JSON.stringify(role)} for column type ${JSON.stringify(head.type)}; `
          + `allowed: ${validRolesForType(head.type).join(', ')}`,
        );
      }
      requireUnlocked(head);
      commitHead(this, sheet, ci, { ...copyHead(head), role, roleManual: true });
    },
  }),

  /**
   * Den Typ einer Spalte ändern, wie die Typauswahl im Spaltenkopf; die
   * Werte werden umgerechnet (was nicht passt, wird leer). Eine Rolle, die
   * der neue Typ nicht zulässt, wird neu erkannt und verliert die
   * Bestätigung. Währung bringt zwei, Prozent eine Nachkommastelle. Liefert
   * false, wenn die Spalte den Typ schon hat; jede Sperre lehnt ab.
   */
  setColumnType: command({
    params: { sheetId: text(), columnId: text(), columnType: oneOf(['numeric', 'text', 'date', 'time', 'currency', 'percent', 'binary']) },
    returns: boolean(),
    run({ sheetId, columnId, columnType }) {
      const sheet = sheetOf(this, sheetId);
      const ci = columnIndex(sheet, columnId);
      const head = sheet.columns[ci];
      requireUnlocked(head);
      if (head.type === columnType) return false;
      const cur = sheet.data.columns[ci];
      const converted = convertColumn(cur, head.type, columnType)
        .map((v) => (isCell(v) && fitsType(columnType, v) ? v : null));
      const format = { ...head.format };
      if (columnType === 'currency' && !format.decimals) format.decimals = 2;
      if (columnType === 'percent' && !format.decimals) format.decimals = 1;
      const col = { type: columnType, values: converted, role: head.role, roleManual: head.roleManual };
      reinferRoleAfterRetype(col);
      const next = { ...copyHead(head), type: columnType, format, role: col.role, roleManual: col.roleManual };
      commitHead(this, sheet, ci, next, changedRun(cur, converted));
      return true;
    },
  }),

  /**
   * Einen Anzeigeschlüssel des Formats setzen, wie die Formatspalte der
   * Typauswahl: numeric, currency, percent → decimals (0..6); date →
   * dateFormat; time → timeFormat; text und binary haben keins. `null`
   * stellt die Vorgabe des Typs her. Die Werte bleiben; jede Sperre lehnt ab.
   */
  setColumnFormat: command({
    params: {
      sheetId: text(), columnId: text(), key: oneOf(['decimals', 'dateFormat', 'timeFormat']),
      value: unchecked({ type: 'number|string|null' }),
    },
    run({ sheetId, columnId, key, value }) {
      const sheet = sheetOf(this, sheetId);
      const ci = columnIndex(sheet, columnId);
      const head = sheet.columns[ci];
      /** @type {readonly string[]} */
      const keysForType = FORMAT_KEYS_BY_TYPE[/** @type {keyof typeof FORMAT_KEYS_BY_TYPE} */ (head.type)] ?? [];
      if (!keysForType.includes(key)) {
        const allowed = keysForType.length ? keysForType.join(', ') : 'none, this column type has no format';
        throw new Error(`invalid key ${JSON.stringify(key)} for column type ${JSON.stringify(head.type)}; allowed: ${allowed}`);
      }
      let checked = null;
      if (value !== null) {
        if (key === 'decimals') checked = requireNumber('value', value, { min: 0, max: 6, integer: true });
        else checked = requireEnum('value', value, Object.keys(key === 'dateFormat' ? DATE_FORMATS : TIME_FORMATS));
      }
      requireUnlocked(head);
      const format = { ...head.format };
      if (checked === null) delete format[key];
      else format[key] = checked;
      commitHead(this, sheet, ci, { ...copyHead(head), format });
    },
  }),

  /**
   * Leere Zeilen einfügen, ohne Position am Ende; ohne `count` zehn (wie
   * der Knopf der Leiste). Formeln darunter rücken mit ihrer Zeile.
   */
  addRows: command({
    params: {
      sheetId: text(),
      count: number({ integer: true, min: 1, optional: true }),
      position: number({ optional: true }),
    },
    run({ sheetId, count, position }) {
      const sheet = sheetOf(this, sheetId);
      const rows = sheet.data.rowCount;
      if (position !== undefined) requireIndex('position', position, rows);
      const n = count ?? DEFAULT_ADD_ROWS;
      const at = position ?? rows;
      insertRows(sheet.data, at, n);
      remapFormulaRows(sheet.formulas, (r) => (r >= at ? r + n : r));
      recordInverse(this, { type: 'removeRows', sheetId, startRow: at, count: n });
      done(this, sheet);
    },
  }),

  /**
   * Einen zusammenhängenden Zeilenbereich samt Werten und Formeln
   * entfernen; Formeln darunter rücken nach. Liefert die Zahl entfernter
   * Zeilen. Sperren gelten hier nicht (wie das Zeilenmenü).
   */
  removeRows: command({
    params: { sheetId: text(), startRow: number(), count: number() },
    returns: number({ integer: true }),
    run({ sheetId, startRow, count }) {
      const sheet = sheetOf(this, sheetId);
      const rows = sheet.data.rowCount;
      requireIndex('startRow', startRow, rows, { existing: true });
      const n = requireNumber('count', count, { min: 1, max: rows - startRow, integer: true });
      const { removed } = deleteRows(sheet.data, startRow, n);
      const end = startRow + n;
      const dropped = remapFormulaRows(sheet.formulas, (r) => (r < startRow ? r : r < end ? -1 : r - n));
      recordInverse(this, { type: 'restoreRows', sheetId, startRow, count: n, cols: removed, formulas: groupFormulas(dropped) });
      done(this, sheet);
      return n;
    },
  }),

  /**
   * Eine Zeile verschieben, wie das Ziehen ihres Zeilenkopfs; `toRow` ist
   * ihre Position danach. Ihre Formeln wandern mit. Liefert false, wenn
   * `fromRow` gleich `toRow` ist.
   */
  moveRow: command({
    params: { sheetId: text(), fromRow: number(), toRow: number() },
    returns: boolean(),
    run({ sheetId, fromRow, toRow }) {
      const sheet = sheetOf(this, sheetId);
      const rows = sheet.data.rowCount;
      requireIndex('fromRow', fromRow, rows, { existing: true });
      requireIndex('toRow', toRow, rows, { existing: true });
      if (fromRow === toRow) return false;
      moveRowData(sheet.data, fromRow, toRow);
      remapFormulaRows(sheet.formulas, moveMap(fromRow, toRow));
      recordInverse(this, { type: 'moveRow', sheetId, fromRow: toRow, toRow: fromRow });
      done(this, sheet);
      return true;
    },
  }),

  /**
   * Alle Zeilen nach einer Spalte sortieren, wie „Aufsteigend/Absteigend
   * sortieren“ im Kopfmenü. Die Zeilen werden umgeordnet, Formeln wandern
   * mit ihrer Zeile. Die Richtung gilt absolut; leere Zellen kommen ans
   * Ende. Liefert false, wenn die Zeilen schon so standen.
   */
  sortRows: command({
    params: { sheetId: text(), columnId: text(), direction: oneOf(['asc', 'desc']) },
    returns: boolean(),
    run({ sheetId, columnId, direction }) {
      const sheet = sheetOf(this, sheetId);
      const ci = columnIndex(sheet, columnId);
      const perm = sortPermutation(sheet.data.columns[ci], direction);
      if (perm.every((v, i) => v === i)) return false;
      const inv = permuteRows(sheet, perm);
      recordInverse(this, { type: 'applyRowPermutation', sheetId, perm: inv });
      done(this, sheet);
      return true;
    },
  }),

  /**
   * Nur Umkehrung: ordnet die Zeilen nach `perm` (`neu[i] =
   * alt[perm[i]]`), Formeln wandern mit (Umkehrung von `sortRows`).
   */
  applyRowPermutation: command({
    params: { sheetId: text(), perm: list(number({ integer: true, min: 0 }), hidden) },
    run({ sheetId, perm }) {
      const sheet = sheetOf(this, sheetId);
      const rows = sheet.data.rowCount;
      const seen = new Uint8Array(rows);
      let ok = perm.length === rows;
      for (let i = 0; ok && i < perm.length; i++) {
        const p = perm[i];
        if (p >= rows || seen[p]) ok = false;
        else seen[p] = 1;
      }
      requireForm('perm', `[${perm.length} rows]`, ok, `a permutation of 0..${rows - 1}`);
      const inv = permuteRows(sheet, perm);
      recordInverse(this, { type: 'applyRowPermutation', sheetId, perm: inv });
      done(this, sheet);
    },
  }),

  /**
   * Nur Umkehrung: setzt eine entfernte Spalte samt Kopf, Werten
   * und Formeln wieder ein (Umkehrung von `removeColumn`); `otherFormulas` sind
   * die Texte der anderen Spalten vor dem Entfernen, wörtlich zurückgesetzt.
   */
  restoreColumn: command({
    params: {
      sheetId: text(),
      index: number({ integer: true, min: 0, agentWrite: false }),
      head: object(COLUMN_SHAPE, hidden),
      values: list(cell(), hidden),
      formulas: map(text(), text(), hidden),
      otherFormulas: map(text(), map(text(), text()), hiddenOptional),
    },
    run({ sheetId, index, head, values, formulas, otherFormulas }) {
      const sheet = sheetOf(this, sheetId);
      const count = sheet.columns.length;
      const rows = sheet.data.rowCount;
      requireIndex('index', index, count);
      requireForm('head.id', head.id, !sheet.columns.some((/** @type {any} */ h) => h.id === head.id), 'an id no column of the sheet has');
      requireForm('values', `[${values.length} cells]`, values.length === rows, `${rows} cells`);
      for (const key of Object.keys(formulas)) requireIndex('formulas row', Number(key), rows, { existing: true });
      const off = offShortNames(sheet);
      for (const [key, rowsOf] of Object.entries(otherFormulas ?? {})) {
        for (const row of Object.keys(rowsOf)) requireIndex(`otherFormulas ${key} row`, Number(row), rows, { existing: true });
      }
      insertColumnAt(sheet, index, head, values, formulas);
      for (const [key, rowsOf] of Object.entries(otherFormulas ?? {})) {
        sheet.formulas[key] = { ...(sheet.formulas[key] ?? {}), ...rowsOf };
      }
      recordShortNames(this, sheet, off, count);
      recordInverse(this, { type: 'removeColumn', sheetId, columnId: head.id });
      done(this, sheet);
    },
  }),

  /**
   * Nur Umkehrung: setzt entfernte Zeilen samt Werten (`cols`,
   * spaltenweise) und Formeln (absolute Zeilen) wieder ein (Umkehrung von
   * `removeRows`).
   */
  restoreRows: command({
    params: {
      sheetId: text(),
      startRow: number({ integer: true, min: 0, agentWrite: false }),
      count: number({ integer: true, min: 1, agentWrite: false }),
      cols: list(list(cell()), hidden),
      formulas: map(text(), map(text(), text()), hidden),
    },
    run({ sheetId, startRow, count, cols, formulas }) {
      const sheet = sheetOf(this, sheetId);
      const rows = sheet.data.rowCount;
      requireIndex('startRow', startRow, rows);
      const ok = cols.length === sheet.columns.length && cols.every((c) => c.length === count);
      requireForm('cols', `[${cols.length} columns]`, ok, `${sheet.columns.length} columns of ${count} cells`);
      const ids = new Set(sheet.columns.map((/** @type {any} */ h) => h.id));
      for (const [id, byRow] of Object.entries(formulas)) {
        requireForm('formulas column', id, ids.has(id), 'a column id of the sheet');
        for (const key of Object.keys(byRow)) {
          const r = Number(key);
          requireForm('formulas row', key, Number.isInteger(r) && r >= startRow && r < startRow + count, `${startRow}..${startRow + count - 1}`);
        }
      }
      insertRows(sheet.data, startRow, count);
      cols.forEach((values, c) => {
        const col = sheet.data.columns[c];
        for (let k = 0; k < count; k++) col[startRow + k] = values[k];
      });
      remapFormulaRows(sheet.formulas, (r) => (r >= startRow ? r + count : r));
      for (const [id, byRow] of Object.entries(formulas)) sheet.formulas[id] = { ...(sheet.formulas[id] ?? {}), ...byRow };
      recordInverse(this, { type: 'removeRows', sheetId, startRow, count });
      done(this, sheet);
    },
  }),
};
