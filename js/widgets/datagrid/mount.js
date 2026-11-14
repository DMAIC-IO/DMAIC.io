/**
 * Tabelle über core/datagrid/datagrid.js: zeichnet `config` neu, sobald sie sich
 * ändert (eine DataGrid-Instanz je Widget), und gibt Zelländerung, Einfügen und
 * Zeilenmenü als Kommandos des Moduls hinaus. Eigener Datenstand: nur die
 * zuletzt gezeichnete `config`. Nach jedem Kommando zeigt die Tabelle wieder
 * deren Werte; bei gleicher Form (Spalten und Zeilenzahl) bleibt die Auswahl.
 */
import { DataGrid, isNumericType } from '../../core/datagrid/datagrid.js';
import { parseNumber } from '../../core/number-format.js';

/** Klasse, an der DataGrid den Nur-Lese-Zustand erkennt (wie im abgeschlossenen Projekt). */
const READONLY = 'dmike--readonly';

/**
 * Zellwert ins Grid: Zahlspalten bekommen Zahlen, sonst Text; leer → null.
 * @param {string} type @param {string|null} raw @returns {number|string|null}
 */
function toGrid(type, raw) {
  if (raw == null || raw === '') return null;
  if (!isNumericType(type)) return raw;
  const n = parseNumber(raw);
  return Number.isFinite(n) ? n : raw;
}

/**
 * Zellwert ans Modul: Zahlspalten als Zahl (nicht lesbare Eingabe bleibt Text, das
 * Kommando lehnt sie ab), sonst Text; leer → null.
 * @param {string} type @param {any} v @returns {number|string|null}
 */
function toCommand(type, v) {
  if (v == null || v === '') return null;
  if (!isNumericType(type)) return String(v);
  const n = parseNumber(v);
  return Number.isFinite(n) ? n : String(v);
}

/**
 * Spalten im Format von DataGrid.setData.
 * @param {any} config @param {string|null} moduleId
 * @returns {object[]}
 */
function gridColumns(config, moduleId) {
  return config.columns.map((c, ci) => ({
    id: c.key,
    name: c.name,
    type: c.type,
    unit: c.unit || null,
    values: config.rows.map((row) => toGrid(c.type, row[ci] ?? null)),
    format: c.format ? { ...c.format } : {},
    meta: c.lock ? { lock: c.lock, managedBy: moduleId, reason: c.reason ?? null } : null,
  }));
}

/**
 * @param {HTMLElement} root
 * @param {{ props: any, services: any, effect: Function, command: (name: string, args: object) => Promise<{ ok: boolean }> }} w
 * @returns {{ destroy: () => void, grid: DataGrid }}
 */
export function mount(root, { props, services, effect, command }) {
  const { i18n, moduleId = null } = services;
  const slot = document.createElement('div');
  slot.className = 'widget-datagrid';
  root.append(slot);
  /** @type {any} zuletzt gezeichnete Eingabe */
  let config = null;
  /** Form der zuletzt gezeichneten Eingabe: Spaltenschlüssel und Zeilenzahl. */
  let shape = '';
  const grid = new DataGrid(slot, {
    t: (key) => i18n.t(key),
    lang: () => i18n.getLanguage(),
    toast: services.notify ?? (() => {}),
    dialog: services.dialog ?? null,
    extraRowMenuItems: (cell) => {
      if (!config || config.readOnly || !config.contextMenu.length) return undefined;
      return config.contextMenu.map(({ id, labelKey }) => ({
        label: i18n.t(`modules.${moduleId}.${labelKey}`),
        action: () => { send(id, { row: cell.rowIdx }); },
      }));
    },
  });
  const render = () => {
    if (!config) return;
    slot.classList.toggle(READONLY, config.readOnly);
    const next = JSON.stringify([config.columns.map((c) => c.key), config.rows.length]);
    // setData verwirft die Auswahl; dieselbe Tabelle mit neuen Werten behält sie.
    const keep = next === shape && grid.selection ? { ...grid.selection } : null;
    grid.setData(gridColumns(config, moduleId));
    shape = next;
    if (keep) grid.setSelection(keep);
  };
  /**
   * Kommando senden, danach immer die Werte der Eingabe zeigen: abgelehnt, ohne
   * Änderung oder gekappt steht sonst die getippte Eingabe im Grid.
   */
  const send = async (name, args) => {
    const res = await command(name, args);
    render();
    return res;
  };
  const column = (key) => config?.columns.find((c) => c.key === key) ?? null;

  grid.on('cell:changed', ({ columnId, rowIndex, newValue }) => {
    const col = column(columnId);
    if (!col || config.readOnly || !props.onCell) { render(); return; }
    send(props.onCell, { row: rowIndex, column: col.key, value: toCommand(col.type, newValue) });
  });
  grid.on('data:pasted', ({ range, data }) => {
    const cols = config ? config.columns.slice(range.startCol, range.startCol + range.cols) : [];
    if (!cols.length || config.readOnly || !props.onPaste) { render(); return; }
    // Zeilen und Spalten, die DataGrid beim Einfügen angehängt hat, verschwinden mit dem Neuzeichnen nach dem Kommando.
    const values = Array.from({ length: range.rows }, (_, r) => cols.map((c, ci) => toCommand(c.type, data[ci][r])));
    send(props.onPaste, { row: range.startRow, column: cols[0].key, values });
  });

  effect(() => {
    config = props.config;
    render();
  });

  return {
    grid,
    destroy: () => {
      grid.destroy();
      slot.remove();
    },
  };
}
