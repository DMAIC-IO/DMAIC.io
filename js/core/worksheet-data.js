/**
 * D.Mike — Reaktiver Lesezugriff auf Arbeitsblätter (worksheet-data.js)
 *
 * `ctx.data` im view-Block: jede Funktion liest zuerst einen reaktiven Zähler
 * der Arbeitsblatt-Instanz und löst dann über `resolveColumnRef` auf. Ein
 * `computed` oder Getter, der so liest, rechnet neu, sobald sich das Blatt
 * ändert. Den Zähler erhöht genau ein Abonnent je Bus
 * (`installWorksheetRevisions`); die Arbeitsblatt-Ereignisse bleiben, wie sie
 * sind.
 */
import Alpine from '@alpinejs/csp';
import { resolveColumnRef, discoverColumns, columnOption } from './worksheet-columns.js';
import { parseNumeric } from './datagrid/datagrid-utils.js';

/** Zähler je Arbeitsblatt-Instanz; `'*'` zählt Ereignisse, die alle betreffen, `'#list'` jede Änderung (Spaltenlisten). */
const rev = Alpine.reactive({ '*': 0, '#list': 0 });
const installed = new WeakSet();

/** @param {string} key */
function bump(key) { rev[key] = (rev[key] ?? 0) + 1; if (key !== '#list') rev['#list'] += 1; }

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
 * @typedef {{ values: (ref: ColumnRef|null) => any[]|null,
 *   numeric: (ref: ColumnRef|null) => number[]|null,
 *   name: (ref: ColumnRef|null) => string|null,
 *   columns: (filter?: { types?: string[], minCount?: number }) => { key: string, name: string }[] }} WorksheetData
 */

/**
 * Lesezugriff auf Arbeitsblattspalten; `columns(filter)` listet die wählbaren Spalten als `{ key, name }` (reaktiv auf jede Änderung und auf neue Arbeitsblätter); `null`, wenn `ref` fehlt oder Blatt/Spalte nicht auflösbar sind.
 * `numeric` liest wie das Arbeitsblatt (`parseNumeric`): Dezimalkomma zählt, Leerwerte, Text und Wahrheitswerte fallen heraus; `Infinity` bleibt ausgeschlossen.
 * @param {{ getModuleState: (id: string) => any, get: (path: string) => any }} stateManager
 * @returns {Readonly<WorksheetData>}
 */
export function createWorksheetData(stateManager) {
  /** @param {ColumnRef|null} ref */
  const column = (ref) => {
    void rev['*'];
    if (!ref || typeof ref.instanceId !== 'string') return null;
    void rev[ref.instanceId];
    return resolveColumnRef(stateManager, ref);
  };
  return Object.freeze({
    values(ref) { const c = column(ref); return c ? [...(c.values ?? [])] : null; },
    numeric(ref) {
      const c = column(ref);
      return c ? (c.values ?? []).map((v) => (typeof v === 'boolean' ? null : parseNumeric(v))).filter((v) => v !== null && Number.isFinite(v)) : null;
    },
    columns(filter) {
      void rev['*'];
      void rev['#list'];
      return discoverColumns(stateManager, filter ?? {}).map(columnOption);
    },
    name(ref) { const c = column(ref); return c ? (c.name || c.shortName || '?') : null; },
  });
}
