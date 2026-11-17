/**
 * Tabelle über core/datagrid/datagrid.js: zeichnet `config` neu, sobald sie sich
 * ändert (eine DataGrid-Instanz je Widget), und gibt Zelländerung, Einfügen und
 * Zeilenmenü als Kommandos des Moduls hinaus. Eigener Datenstand: nur die
 * zuletzt gezeichnete `config`. Jede Änderung im Grid (Tippen, Einfügen,
 * Löschen, Ausschneiden, Ausfüllen, Rückgängig) wird mit der Eingabe abgeglichen
 * (Spalten nach Schlüssel) und als Kommando hinausgegeben; Sortieren und das
 * Einfügen, Löschen oder Verschieben von Zeilen und Spalten sendet nichts, die
 * Tabelle zeigt danach wieder die Eingabe. Nach jedem Kommando zeigt die Tabelle wieder
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
 * Auswahl auf die Tabelle gekappt: keine Zeile und keine Spalte jenseits des Endes.
 * @param {any} sel @param {number} rows @param {number} cols
 * @returns {any|null} null, wenn die Tabelle leer ist
 */
function clampRange(sel, rows, cols) {
  if (rows < 1 || cols < 1) return null;
  const r = (v) => Math.max(0, Math.min(rows - 1, v));
  const c = (v) => Math.max(0, Math.min(cols - 1, v));
  return {
    ...sel,
    startRow: r(sel.startRow), endRow: r(sel.endRow), activeRow: r(sel.activeRow ?? sel.startRow),
    startCol: c(sel.startCol), endCol: c(sel.endCol), activeCol: c(sel.activeCol ?? sel.startCol),
  };
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
  /** Zeichnet das Widget gerade selbst (setData), statt dass der Nutzer ändert? */
  let drawing = false;
  /** Ein Kommando ist unterwegs; danach zeichnet das Widget ohnehin neu. */
  let busy = false;
  /** Seit dem letzten Zeichnen hat eine Aktion Zeilen oder Spalten verschoben. */
  let structural = false;
  /** Ein Abgleich ist für die nächste Mikroaufgabe eingeplant. */
  let scheduled = false;
  const render = () => {
    if (!config) return;
    slot.classList.toggle(READONLY, config.readOnly);
    const next = JSON.stringify([config.columns.map((c) => c.key), config.rows.length]);
    // setData verwirft die Auswahl; dieselbe Tabelle mit neuen Werten behält sie, gekappt auf die Tabelle.
    const keep = next === shape && grid.selection ? clampRange(grid.selection, config.rows.length, config.columns.length) : null;
    drawing = true;
    structural = false;
    try {
      grid.setData(gridColumns(config, moduleId));
    } finally {
      drawing = false;
    }
    shape = next;
    if (keep) grid.setSelection(keep);
  };
  /**
   * Kommando senden, danach immer die Werte der Eingabe zeigen: abgelehnt, ohne
   * Änderung oder gekappt steht sonst die getippte Eingabe im Grid.
   */
  const send = async (name, args) => {
    busy = true;
    try {
      return await command(name, args);
    } finally {
      busy = false;
      render();
    }
  };

  /**
   * Gleicht die Zellen des Grids mit der gezeichneten Eingabe ab und schickt jede
   * Abweichung als Kommando: eine Zelle über `onCell`, mehrere als Block über
   * `onPaste` (Rechteck um alle Abweichungen; gesperrte Spalten darin `null`).
   * So erreicht jeder Bearbeitungsweg von DataGrid das Modul: Tippen, Einfügen,
   * Löschen, Ausschneiden, Ausfüllen, Rückgängig. Ohne passendes Kommando oder
   * im Nur-Lese-Zustand zeigt die Tabelle wieder die Eingabe.
   */
  const reconcile = () => {
    scheduled = false;
    if (!config || drawing || busy) return;
    const cols = config.columns;
    // Sortieren, Zeilen einfügen/löschen/verschieben, Spalten löschen/verschieben verschieben
    // die Zellen gegen die Eingabe: nichts senden, die Eingabe neu zeichnen (macht es rückgängig).
    const byKey = cols.map((c) => grid.columns.find((g) => g.id === c.key) ?? null);
    if (structural || grid.sortCol !== null || byKey.some((g) => g === null)) {
      structural = false;
      render();
      return;
    }
    const rows = Math.max(config.rows.length, grid.rowCount);
    const now = (c, r) => toCommand(cols[c].type, byKey[c].values[r] ?? null);
    const was = (c, r) => (r < config.rows.length ? toCommand(cols[c].type, toGrid(cols[c].type, config.rows[r][c] ?? null)) : null);
    let r1 = Infinity; let r2 = -1; let c1 = Infinity; let c2 = -1;
    for (let c = 0; c < cols.length; c++) {
      if (cols[c].lock) continue;
      for (let r = 0; r < rows; r++) {
        if (now(c, r) === was(c, r)) continue;
        r1 = Math.min(r1, r); r2 = Math.max(r2, r); c1 = Math.min(c1, c); c2 = Math.max(c2, c);
      }
    }
    // Keine Abweichung: eine eingefügte leere Spalte oder Zeile verschwindet wieder.
    if (r2 < 0) {
      if (grid.columns.length !== cols.length || grid.rowCount !== config.rows.length) render();
      return;
    }
    if (config.readOnly) { render(); return; }
    if (r1 === r2 && c1 === c2) {
      if (!props.onCell) { render(); return; }
      send(props.onCell, { row: r1, column: cols[c1].key, value: now(c1, r1) });
      return;
    }
    if (!props.onPaste) { render(); return; }
    const values = [];
    for (let r = r1; r <= r2; r++) {
      const line = [];
      for (let c = c1; c <= c2; c++) line.push(cols[c].lock ? null : now(c, r));
      values.push(line);
    }
    send(props.onPaste, { row: r1, column: cols[c1].key, values });
  };
  const schedule = () => {
    if (drawing || scheduled) return;
    scheduled = true;
    queueMicrotask(reconcile);
  };
  // Leeren und Ausfüllen zeichnen ohnehin neu ('render'); ihre eigenen Ereignisse binden den Abgleich nicht daran.
  for (const ev of ['render', 'cell:changed', 'data:pasted', 'data:cleared', 'data:filled', 'undo', 'redo']) grid.on(ev, schedule);
  // Strukturelle Aktionen: Zeilen nur am Ende anhängen (Einfügen über den Rand) lässt die Zellen an ihrem Platz.
  const shifted = () => { structural = true; schedule(); };
  for (const ev of ['rows:removed', 'rows:moved', 'column:removed', 'column:moved']) grid.on(ev, shifted);
  grid.on('rows:added', ({ startIndex }) => { if (startIndex < (config?.rows.length ?? 0)) shifted(); });

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
