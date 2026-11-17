/**
 * D.Mike — Arbeitsblatt: Kommandos für Blätter (domain/commands-sheets.js)
 *
 * `addSheet`, `renameSheet`, `duplicateSheet`, `insertSheetBefore` und
 * `removeSheet`. Prüfungen und Meldungen wörtlich aus den heutigen
 * Agentenaktionen (`worksheet.js`); eine unbekannte Blatt-id meldet
 * `unknown_sheet: <id>` wie alle Kommandos der Zielform. Ein neues Blatt
 * wird aktiv, wie heute; `removeSheet` hält `activeSheetId` selbst gültig
 * (die Invariante `activeSheet` greift nur bei einem Schreiben dieses Felds).
 *
 * Umkehrungen, nur für den Verlauf (`@noagent`, Parameter mit
 * `agentWrite: false`):
 * - `restoreSheet({ index, sheet, sheetCounter, activeSheetId })` setzt ein
 *   Blatt wieder ein. Es trägt das Blatt als JSON, eine Kopie je Löschen.
 * - `dropSheet({ id, sheetCounter, activeSheetId })` nimmt ein angelegtes
 *   Blatt wieder heraus (Umkehrung von Anlegen, Kopieren, Einfügen und
 *   `restoreSheet`).
 * - `restoreSheetName({ id, name })` setzt einen Namen wörtlich, auch leer.
 * Beide Blatt-Umkehrungen tragen `sheetCounter` und `activeSheetId` des
 * Stands davor, damit Rückgängig ihn genau herstellt.
 *
 * Die Vorgabenamen („Sheet 3“, „<Name> (Copy)“) sind unübersetzt; das
 * Viewmodel übergibt den übersetzten Namen über `name`.
 *
 * Rein: kein DOM, kein i18n.
 */
import { command, text, number, object, recordInverse, markTableChanged } from '../../../core/model.js';
import { requireIndex, requireForm } from '../../../core/validate.js';
import { TableData } from '../../../core/table-data.js';
import { sheetOf } from './commands-cells.js';
import { SHEET_SHAPE, FALLBACK_SHEET_NAME, FALLBACK_COPY_WORD, newSheetState } from './sheet.js';

const hidden = { agentWrite: false };

// ─── Hilfen ──────────────────────────────────────────────────────

/**
 * Ein Blatt als JSON: eigene Kopie von Köpfen, Formeln und Zellen.
 * @param {any} sheet @returns {{ id: string, name: string, columns: object[], formulas: object, data: { rowCount: number, columns: any[][] } }}
 */
function sheetJSON(sheet) {
  return {
    id: sheet.id,
    name: sheet.name,
    columns: sheet.columns.map((/** @type {any} */ h) => ({
      ...h,
      format: { ...h.format },
      meta: h.meta === null ? null : JSON.parse(JSON.stringify(h.meta)),
    })),
    formulas: Object.fromEntries(Object.entries(sheet.formulas)
      .map(([id, byRow]) => [id, { .../** @type {object} */ (byRow) }])),
    data: sheet.data.toJSON(),
  };
}

/**
 * Die nächste freie Blatt-id `sheet_<n>` ab `sheetCounter + 1`.
 * @param {any} model @returns {{ id: string, n: number }}
 */
function nextSheetId(model) {
  const taken = new Set(model.sheets.map((/** @type {{ id: string }} */ s) => s.id));
  let n = model.sheetCounter + 1;
  while (taken.has(`sheet_${n}`)) n++;
  return { id: `sheet_${n}`, n };
}

/**
 * Ein neues Blatt an `at` einsetzen, aktiv machen, Zähler setzen; Umkehrung
 * `dropSheet` mit dem Stand davor.
 * @param {any} model @param {number} at @param {any} sheet @param {number} counter
 * @returns {string} id des Blatts
 */
function insertSheet(model, at, sheet, counter) {
  recordInverse(model, { type: 'dropSheet', id: sheet.id, sheetCounter: model.sheetCounter, activeSheetId: model.activeSheetId });
  model.sheets.splice(at, 0, sheet);
  model.sheetCounter = counter;
  model.activeSheetId = sheet.id;
  markTableChanged(model, sheet.data);
  return sheet.id;
}

/**
 * Ein Blatt herausnehmen; Umkehrung `restoreSheet` mit dem Blatt als JSON
 * und dem Stand davor.
 * @param {any} model @param {any} sheet @param {string} activeSheetId aktives Blatt danach
 * @param {number} sheetCounter Zähler danach
 */
function takeSheet(model, sheet, activeSheetId, sheetCounter) {
  const index = model.sheets.indexOf(sheet);
  recordInverse(model, {
    type: 'restoreSheet', index, sheet: sheetJSON(sheet),
    sheetCounter: model.sheetCounter, activeSheetId: model.activeSheetId,
  });
  model.sheets.splice(index, 1);
  model.sheetCounter = sheetCounter;
  model.activeSheetId = activeSheetId;
  markTableChanged(model, sheet.data);
}

/**
 * Die Blatt-id, die ein Umkehr-Kommando aktiv setzt, muss es danach geben.
 * @param {string} activeSheetId @param {string[]} ids Blätter danach
 */
function requireActive(activeSheetId, ids) {
  requireForm('activeSheetId', activeSheetId, ids.includes(activeSheetId), `one of ${ids.join(', ')}`);
}

// ─── Kommandos ───────────────────────────────────────────────────

export const sheetCommands = {
  /**
   * Ein neues Blatt am Ende anlegen und aktiv machen: fünf leere
   * Zahlenspalten C1–C5. Ohne Namen heißt es „Sheet <n>“. Liefert die id.
   * @agent
   */
  addSheet: command({
    params: { name: text({ optional: true }) },
    returns: text(),
    run({ name } = {}) {
      const { id, n } = nextSheetId(this);
      return insertSheet(this, this.sheets.length, newSheetState(name || `${FALLBACK_SHEET_NAME} ${n}`, id), n);
    },
  }),

  /**
   * Ein Blatt umbenennen; der Name wird getrimmt. Ein leerer Name (oder nur
   * Leerzeichen) ist ein Fehler.
   * @agent
   */
  renameSheet: command({
    params: { id: text(), name: text() },
    run({ id, name }) {
      const sheet = sheetOf(this, id);
      const trimmed = name.trim();
      if (trimmed === '') {
        throw new Error(`empty sheet name for id "${id}"; a sheet name must contain a non-space character`);
      }
      if (trimmed === sheet.name) return;
      recordInverse(this, { type: 'restoreSheetName', id, name: sheet.name });
      sheet.name = trimmed;
    },
  }),

  /**
   * Ein Blatt mit Zellen, Formeln und Spalteneinstellungen kopieren. Die
   * Kopie kommt ans Ende, heißt ohne Namen „<Name> (Copy)“ und wird aktiv.
   * Liefert ihre id.
   * @agent
   */
  duplicateSheet: command({
    params: { id: text(), name: text({ optional: true }) },
    returns: text(),
    run({ id, name }) {
      const src = sheetOf(this, id);
      const { id: copyId, n } = nextSheetId(this);
      const json = sheetJSON(src);
      const copy = {
        ...json,
        id: copyId,
        name: name || `${src.name} (${FALLBACK_COPY_WORD})`,
        data: TableData.fromJSON(json.data),
      };
      return insertSheet(this, this.sheets.length, copy, n);
    },
  }),

  /**
   * Ein leeres Blatt direkt vor einem anderen anlegen und aktiv machen.
   * Ohne Namen heißt es „Sheet <n>“. Liefert die id.
   * @agent
   */
  insertSheetBefore: command({
    params: { id: text(), name: text({ optional: true }) },
    returns: text(),
    run({ id, name }) {
      const anchor = sheetOf(this, id);
      const at = this.sheets.indexOf(anchor);
      const { id: newId, n } = nextSheetId(this);
      return insertSheet(this, at, newSheetState(name || `${FALLBACK_SHEET_NAME} ${n}`, newId), n);
    },
  }),

  /**
   * Ein Blatt samt Inhalt entfernen. War es aktiv, wird das benachbarte
   * Blatt aktiv. Das letzte Blatt lässt sich nicht entfernen.
   * @agent
   */
  removeSheet: command({
    params: { id: text() },
    run({ id }) {
      const sheet = sheetOf(this, id);
      if (this.sheets.length <= 1) {
        throw new Error(`last sheet "${id}" cannot be removed; a workbook keeps at least one sheet`);
      }
      const at = this.sheets.indexOf(sheet);
      const rest = this.sheets.filter((/** @type {any} */ s) => s !== sheet);
      const active = this.activeSheetId === id ? rest[Math.min(at, rest.length - 1)].id : this.activeSheetId;
      takeSheet(this, sheet, active, this.sheetCounter);
    },
  }),

  /**
   * @noagent Nur Umkehrung: setzt ein entferntes Blatt (JSON) an `index`
   * wieder ein, mit Zähler und aktivem Blatt des Stands davor.
   */
  restoreSheet: command({
    params: {
      index: number({ integer: true, min: 0, ...hidden }),
      sheet: object(SHEET_SHAPE, hidden),
      sheetCounter: number({ integer: true, min: 0, ...hidden }),
      activeSheetId: text(hidden),
    },
    run({ index, sheet, sheetCounter, activeSheetId }) {
      const ids = this.sheets.map((/** @type {{ id: string }} */ s) => s.id);
      requireIndex('index', index, ids.length);
      requireForm('sheet.id', sheet.id, !ids.includes(sheet.id), 'an id no sheet has');
      requireActive(activeSheetId, [...ids, sheet.id]);
      requireForm('sheet.data', `[${sheet.data.columns.length} columns]`,
        sheet.data.columns.length === sheet.columns.length, `${sheet.columns.length} columns`);
      insertSheet(this, index, sheet, sheetCounter);
      this.activeSheetId = activeSheetId;
    },
  }),

  /**
   * @noagent Nur Umkehrung: nimmt ein angelegtes Blatt wieder heraus, mit
   * Zähler und aktivem Blatt des Stands davor.
   */
  dropSheet: command({
    params: {
      id: text(hidden),
      sheetCounter: number({ integer: true, min: 0, ...hidden }),
      activeSheetId: text(hidden),
    },
    run({ id, sheetCounter, activeSheetId }) {
      const sheet = sheetOf(this, id);
      const rest = this.sheets.filter((/** @type {any} */ s) => s !== sheet).map((/** @type {any} */ s) => s.id);
      requireForm('id', id, rest.length > 0, 'a sheet that is not the last one');
      requireActive(activeSheetId, rest);
      takeSheet(this, sheet, activeSheetId, sheetCounter);
    },
  }),

  /**
   * @noagent Nur Umkehrung: setzt den Namen eines Blatts wörtlich, auch leer
   * (Umkehrung von `renameSheet`).
   */
  restoreSheetName: command({
    params: { id: text(hidden), name: text(hidden) },
    run({ id, name }) {
      const sheet = sheetOf(this, id);
      if (sheet.name === name) return;
      recordInverse(this, { type: 'restoreSheetName', id, name: sheet.name });
      sheet.name = name;
    },
  }),
};
