/**
 * D.Mike — Reaktiver Lesezugriff auf Arbeitsblätter (worksheet-data.js)
 *
 * `ctx.data` im view-Block: jede Funktion liest zuerst einen reaktiven Zähler
 * der Arbeitsblatt-Instanz und löst dann über `resolveColumnRef` bzw.
 * `readWorksheet` auf (beide lesen über den registrierten Leser, `readSync`). Ein
 * `computed` oder Getter, der so liest, rechnet neu, sobald sich das Blatt
 * ändert. Den Zähler erhöht genau ein Abonnent je Bus
 * (`installWorksheetRevisions`); die Arbeitsblatt-Ereignisse bleiben, wie sie
 * sind.
 */
import Alpine from '@alpinejs/csp';
import { resolveColumnRef, discoverColumns, columnOption, readWorksheet, setWorksheetTouch } from './worksheet-columns.js';
import { parseNumeric } from './datagrid/datagrid-utils.js';

/** Zähler je Arbeitsblatt-Instanz; `'*'` zählt Ereignisse, die alle betreffen, `'#list'` jede Änderung (Spaltenlisten). */
const rev = Alpine.reactive({ '*': 0, '#list': 0 });
const installed = new WeakSet();

// Jedes Lesen über die Fassade hängt vom Zähler ab, auch für Altleser ohne `ctx.data`.
setWorksheetTouch((key) => { void rev['*']; void rev[key]; });

/** @param {string} key */
function bump(key) { rev[key] = (rev[key] ?? 0) + 1; if (key !== '#list') rev['#list'] += 1; }

/**
 * Alle Leser neu rechnen lassen (`rev['*']`). Für das Vorladen: liefert der
 * Leser bis zum Laden des Arbeitsblatt-Moduls `null`, rechnen danach alle
 * `computed` neu.
 * @returns {void}
 */
export function bumpWorksheetRevisions() { bump('*'); }

/**
 * Den Zähler an den Bus hängen; je Bus nur einmal wirksam.
 * @param {{ on: (event: string, fn: Function) => void }} eventBus
 * @returns {void}
 */
export function installWorksheetRevisions(eventBus) {
  if (installed.has(eventBus)) return;
  installed.add(eventBus);
  eventBus.on('worksheet:dataChanged', (p) => { if (p?.instanceId) bump(p.instanceId); });
  eventBus.on('module:removed', (p) => { if (p?.instanceId) bump(p.instanceId); });
  eventBus.on('state:remote-changed', (p) => { for (const id of p?.instanceIds ?? []) bump(id); });
  eventBus.on('module:added', (p) => { if (p?.moduleId === 'worksheet') bump('#list'); });
  for (const ev of ['project:imported', 'project:switched', 'project:rehydrated']) eventBus.on(ev, () => bump('*'));
}

/**
 * @typedef {{ instanceId: string, sheetId?: string, columnId: string }} ColumnRef
 * @typedef {{ name: string, type: string, role: string|null, roleConfirmed: boolean }} WorksheetColumnInfo
 * @typedef {{ values: (ref: ColumnRef|null) => any[]|null,
 *   numeric: (ref: ColumnRef|null) => number[]|null,
 *   name: (ref: ColumnRef|null) => string|null,
 *   column: (ref: ColumnRef|null) => WorksheetColumnInfo|null,
 *   columns: (filter?: { types?: string[], minCount?: number }) => { key: string, name: string }[],
 *   sheet: (ref: { instanceId: string, sheetId: string }|null) => { id: string, name: string, rowCount: number, columns: { id: string, name: string, type: string, meta: object|null }[] }|null,
 *   sheets: (instanceId: string|null) => { id: string, name: string, rowCount: number }[]|null }} WorksheetData
 */

/**
 * Lesezugriff auf Arbeitsblattspalten; `column(ref)` liefert Name, Typ, Rolle und Rollenbestätigung (ohne Werte); `columns(filter)` listet die wählbaren Spalten als `{ key, name }` (reaktiv auf jede Änderung und auf neue Arbeitsblätter); `sheet(ref)` nennt Zeilenzahl und Spalten eines Blatts mit ihren Merkmalen (`meta`, Kopie, sonst `null`); `null`, wenn `ref` fehlt oder Blatt/Spalte nicht auflösbar sind.
 * `numeric` liest wie das Arbeitsblatt (`parseNumeric`): Dezimalkomma zählt, Leerwerte, Text und Wahrheitswerte fallen heraus; `Infinity` bleibt ausgeschlossen.
 * @param {{ get: (path: string) => any }} stateManager  mit registriertem Leser (`registerWorksheetReader`)
 * @returns {Readonly<WorksheetData>}
 */
export function createWorksheetData(stateManager) {
  /** @param {ColumnRef|null} ref */
  const resolve = (ref) => {
    void rev['*'];
    if (!ref || typeof ref.instanceId !== 'string') return null;
    void rev[ref.instanceId];
    return resolveColumnRef(stateManager, ref);
  };
  return Object.freeze({
    values(ref) { const c = resolve(ref); return c ? [...(c.values ?? [])] : null; },
    numeric(ref) {
      const c = resolve(ref);
      return c ? (c.values ?? []).map((v) => (typeof v === 'boolean' ? null : parseNumeric(v))).filter((v) => v !== null && Number.isFinite(v)) : null;
    },
    columns(filter) {
      void rev['*'];
      void rev['#list'];
      return discoverColumns(stateManager, filter ?? {}).map(columnOption);
    },
    column(ref) {
      const c = resolve(ref);
      return c ? { name: c.name || c.shortName || '?', type: c.type, role: c.role ?? null, roleConfirmed: c.roleManual === true } : null;
    },
    sheet(ref) {
      void rev['*'];
      if (!ref || typeof ref.instanceId !== 'string') return null;
      void rev[ref.instanceId];
      if (typeof ref.sheetId !== 'string') return null;
      const out = readWorksheet(stateManager, ref.instanceId, { sheetId: ref.sheetId });
      if (!out || out.sheetId !== ref.sheetId) return null;
      const sh = out.sheets.find((x) => x.id === ref.sheetId);
      return {
        id: sh.id, name: sh.name, rowCount: out.rowCount ?? 0,
        // `meta` ist im Lesen schon eine Kopie.
        columns: (out.columns ?? []).map((c) => ({
          id: c.id, name: c.name || c.shortName || '?', type: c.type, meta: c.meta ?? null,
        })),
      };
    },
    sheets(instanceId) {
      void rev['*'];
      void rev['#list'];
      if (typeof instanceId !== 'string') return null;
      void rev[instanceId];
      const head = readWorksheet(stateManager, instanceId, { fields: ['sheets'] });
      if (!head?.sheets) return null;
      // Je Blatt ein Lesen mit `sheetId`: `rowCount` steht nur am gezeigten Blatt.
      return head.sheets.map((sh) => ({
        id: sh.id, name: sh.name,
        rowCount: readWorksheet(stateManager, instanceId, { sheetId: sh.id })?.rowCount ?? 0,
      }));
    },
    name(ref) { const c = resolve(ref); return c ? (c.name || c.shortName || '?') : null; },
  });
}
