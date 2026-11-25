/**
 * D.Mike — Bedienung des Rasters (datagrid/view/grid-input.js)
 *
 * Auswahl, Tastatur, Zelleneditor, Ziehen mit Scrollen am Rand, Ausfüllgriff,
 * Block am Auswahlrand verschieben, Zwischenablage, Spaltenbreite sowie
 * Zeilen-/Spaltenverschieben über einer GridView (grid-view.js). Die Bedienung
 * ändert nie Daten: sie meldet Kommandos über `emit(role, args)` mit einer
 * Rolle aus P7 und Argumenten in Model-Form. Die Blatt-Id kennt sie nicht; feste Argumente mischt das Widget
 * hinzu (Ruling R2).
 *
 * Ansichtszustand (Auswahl, Spaltenbreiten) hält die Bedienung selbst und
 * meldet ihn entprellt (300 ms) über die Rolle `gridView`. Rückgängig und
 * Wiederholen (Strg+Z/Y) behandelt sie nicht: das übernimmt der globale
 * Handler des Arbeitsbereichs (Ruling R8).
 *
 * Bestandsliste der Bedienung: Spec F1.14, „Nachtrag Bedienliste“.
 */
import { h, isShown } from '../../dom.js';
import { icon } from '../../icon.js';
import { shortcutRegistry } from '../../shortcut-registry.js';
import { formatGridLossless } from '../datagrid-utils.js';
import { parseClipboard } from '../table/paste.js';
import * as S from './selection.js';
import { createGridMenus } from './grid-menus.js';

/** Merkmal (P7 `features`), ohne das eine Rolle aus ist. Rollen ohne Eintrag hängen an keinem Merkmal. */
const FEATURE_OF_ROLE = Object.freeze({
  setFormula: 'formulas',
  pasteBlock: 'clipboard',
  fillRange: 'fill',
  addColumn: 'structure',
  removeColumn: 'structure',
  moveColumn: 'structure',
  moveCells: 'structure',
  addRows: 'structure',
  removeRows: 'structure',
  moveRow: 'structure',
  sortRows: 'sort',
  setColumnRole: 'roles',
});

/**
 * Ansichtsereignisse an das Modul, keine P7-Rollen: `roles` (die hinterlegten
 * Kommandos) schaltet sie nicht ab. Sie hängen nur an `readOnly` und an
 * `contextMenu` bzw. `features.formulaEditor`.
 */
const VIEW_EVENTS = new Set(['contextMenu', 'openFormulaEditor']);

const GRID_VIEW_DELAY = 300;
const MIN_COL_WIDTH = 50;
const DRAG_THRESHOLD = 4;
const EDGE_ZONE = 30;
const MAX_EDGE_STEP = 40;
/** Breite der Trefferzone am Auswahlrand (px), in der ein Block gegriffen wird. */
const CELL_MOVE_EDGE = 4;

/**
 * Letzter vom Raster kopierter Text, über alle Raster (wie im Altraster):
 * Einfügen genau dieses Texts rät keine Kopfzeile und behält leere Zeilen.
 * @type {string|null}
 */
let lastGridCopy = null;

/**
 * @typedef {import('./selection.js').GridSelection} GridSelection
 * @typedef {{ table: import('../../table-data.js').TableData, columns: any[],
 *   formulas?: Record<string, Record<string, string>>, colWidths?: Record<string, number>,
 *   selection?: GridSelection|null, lang?: string }} GridViewState
 */

/**
 * Hängt die Bedienung an eine GridView.
 *
 * `features` nach P7 (`formulas`, `roles`, `structure`, `sort`, `fill`,
 * `clipboard`); ein Merkmal ist an, solange es nicht `false` ist. Zusätzlich:
 * `stats`/`scan` (Spaltenstatistik/-scan, brauchen `dialog`) und
 * `formulaEditor` (nur bei `true`: Doppelklick auf eine Formelzelle meldet
 * `openFormulaEditor { columnId, row, text? }` statt den Zelleneditor zu öffnen).
 * `roles` (optional) nennt die Rollen, für die ein Kommando hinterlegt ist;
 * fehlt eine, sind ihre Tasten stumm und ihre Menüeinträge ausgeblendet.
 *
 * Gemeldete Rollen und Argumente:
 * `setCells { columnId, startRow, values }`, `setFormula { columnId, row, formula }`,
 * `pasteBlock { columnId, startRow, rows, header? }` (`header: false` bei der eigenen
 * letzten Kopie), `fillRange { source, target, ctrl }`
 * (beide `{ c0, r0, c1, r1 }`, `target` umfasst die Quelle),
 * `moveCells { source: { c0, r0, c1, r1 }, toCol, toRow }` (Ziel der linken oberen Zelle, geklemmt),
 * `clearRange { c0, r0, c1, r1 }`, `addColumn { position }`, `removeColumn { columnId }`,
 * `moveColumn { columnId, toIndex }`, `renameColumn { columnId, name }`,
 * `addRows { count, position }`, `removeRows { startRow, count }`,
 * `moveRow { fromRow, toRow }`, `sortRows { columnId, direction }`,
 * `setColumnType { columnId, columnType }`, `setColumnFormat { columnId, key, value }`,
 * `setColumnRole { columnId, role }`, `gridView { colWidths, selection }`,
 * `contextMenu { id, columnId, row }` (Zusatzeintrag aus `contextMenu`),
 * `openFormulaEditor { columnId, row, text? }`.
 *
 * Gesperrte Spalten öffnen keinen Editor; die Bedienung sendet dann am
 * Scrollbereich das DOM-Ereignis `cell:edit-blocked` bzw. `column:edit-blocked`
 * (`detail`: `columnId`, `rowIndex`/`action`, `lock`, `reason`, `message`).
 *
 * @param {ReturnType<typeof import('./grid-view.js').createGridView>} view
 * @param {{ emit: (role: string, args: object) => void, features?: Record<string, boolean>,
 *   readOnly?: boolean, contextMenu?: { id: string, labelKey: string }[],
 *   t?: (key: string) => string, dialog?: any, roles?: Iterable<string>|null }} opts
 * @returns {{ setView: (state: GridViewState) => void, destroy: () => void }}
 */
export function createGridInput(view, {
  emit, features = {}, readOnly = false, contextMenu = [], t = (k) => k, dialog = null, roles = null,
}) {
  const el = view.el;
  const roleSet = roles ? new Set(roles) : null;
  el.tabIndex = 0;

  /** @type {any} */ let table = null;
  /** @type {any[]} */ let columns = [];
  /** @type {Record<string, Record<string, string>>} */ let formulas = {};
  let lang = 'en';
  /** @type {GridSelection|null} */ let sel = null;
  /** @type {Record<string, number>} */ let colWidths = {};
  /** @type {{ columnId: string, dir: 'asc'|'desc' }|null} */ let sortState = null;
  let lastInSel; let lastInWidths; let lastSentSel; let lastSentWidths;
  let gvTimer = 0;
  let hoverCol = -1;
  /** @type {any} */ let editor = null;
  /** @type {any} */ let headerEdit = null;
  /** @type {any} */ let drag = null;
  /** @type {{ x: number, y: number }|null} */ let pointer = null;
  let autoRaf = 0;

  const frame = h('div', { class: 'datagrid__selection-frame', hidden: true });
  const fillHandle = h('div', { class: 'datagrid__fill-handle' });
  const fillPreview = h('div', { class: 'datagrid__fill-preview', style: 'display:none' });
  frame.append(fillHandle);
  el.append(frame, fillPreview);

  const menus = createGridMenus({ t, getLang: () => lang, dialog });

  // ─── Rollen und Meldungen ─────────────────────────────────────────

  const featureOn = (name) => features[name] !== false;
  /** @param {string} role @returns {boolean} Rolle ist hinterlegt, ihr Merkmal an und das Raster beschreibbar */
  function can(role) {
    if (readOnly) return false;
    if (roleSet && !roleSet.has(role) && !VIEW_EVENTS.has(role)) return false;
    const f = FEATURE_OF_ROLE[role];
    return !f || featureOn(f);
  }
  // Export ändert keine Daten: auch im Nur-Lese-Zustand, aber nur mit hinterlegter Rolle.
  const canExport = Boolean(roleSet?.has('exportAs'));
  function send(role, args) {
    if (can(role)) emit(role, args);
  }

  const nCols = () => columns.length;
  const nRows = () => (table ? table.rowCount : 0);

  function lockMessage(col) {
    const tt = (k) => t(`ui.datagrid.${k}`);
    const head = col.lock === 'hard' ? tt('lockHardTitle') : tt('lockSoftTitle');
    const reason = col.reason ? tt(`lockReason.${col.reason}`) : null;
    const managed = col.managedBy ? `${tt('lockManagedBy')}: ${col.managedBy}` : null;
    return [head, reason, managed].filter(Boolean).join(' — ');
  }
  /** Meldung wie im Altgitter (`cell:edit-blocked`, `column:edit-blocked`), als DOM-Ereignis. */
  function blocked(type, col, detail) {
    el.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail: { columnId: col.id, lock: col.lock, reason: col.reason, ...detail, message: lockMessage(col) },
    }));
  }

  // ─── Ansichtszustand ──────────────────────────────────────────────

  function flushGridView() {
    clearTimeout(gvTimer);
    gvTimer = 0;
    const selection = sel ? { ...sel, extraCols: [...sel.extraCols] } : null;
    lastSentSel = JSON.stringify(selection);
    lastSentWidths = JSON.stringify(colWidths);
    send('gridView', { colWidths: { ...colWidths }, selection });
  }
  function scheduleGridView() {
    if (!can('gridView')) return;
    clearTimeout(gvTimer);
    gvTimer = setTimeout(flushGridView, GRID_VIEW_DELAY);
  }

  function redraw() {
    if (!table) return;
    const sortIdx = sortState ? columns.findIndex((c) => c.id === sortState.columnId) : -1;
    view.draw(table, columns, formulas, {
      colWidths, lang, sortCol: sortIdx >= 0 ? sortIdx : undefined, sortDir: sortIdx >= 0 ? sortState.dir : undefined,
      cornerExport: canExport,
    });
  }

  /**
   * @param {GridSelection|null} next
   * @param {{ reveal?: boolean }} [opts] `reveal`: aktive Zelle (bzw. Ende) in den Sichtbereich holen
   */
  function setSel(next, { reveal = true } = {}) {
    sel = next;
    if (sel && reveal) revealCell(sel.endCol, sel.endRow);
    paint();
    announceSelection();
    scheduleGridView();
  }
  /**
   * Meldet die aktuelle Auswahl sofort als DOM-Ereignis `datagrid-selection`
   * (sprudelt): die Statuszeile folgt dem Klick, ohne auf die entprellte
   * Rolle `gridView` zu warten. Keine Datenänderung, kein Kommando.
   */
  function announceSelection() {
    const selection = sel ? { ...sel, extraCols: [...(sel.extraCols ?? [])] } : null;
    el.dispatchEvent(new CustomEvent('datagrid-selection', { bubbles: true, detail: { selection } }));
  }

  // ─── Geometrie (Inhaltskoordinaten des Scrollbereichs) ────────────

  const tbody = () => el.querySelector('tbody');
  const headerCells = () => el.querySelectorAll('thead th[data-col-idx]');
  const th = (c) => el.querySelector(`thead th[data-col-idx="${c}"]`);
  const headH = () => el.querySelector('thead')?.getBoundingClientRect().height || 0;
  function bodyTop() {
    const tb = tbody();
    if (!tb) return 0;
    return tb.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientTop + el.scrollTop;
  }
  function colBox(c) {
    const cell = th(c);
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { left: r.left - el.getBoundingClientRect().left - el.clientLeft + el.scrollLeft, width: r.width };
  }
  /** Rechteck in Inhaltskoordinaten; gilt auch für Zeilen außerhalb des Pools. */
  function boxOf(c0, r0, c1, r1) {
    const a = colBox(c0);
    const b = colBox(c1);
    if (!a || !b) return null;
    const rh = view.rowHeight();
    return { left: a.left, top: bodyTop() + r0 * rh, width: b.left + b.width - a.left, height: (r1 - r0 + 1) * rh };
  }
  const place = (node, box) => {
    node.style.left = `${box.left}px`;
    node.style.top = `${box.top}px`;
    node.style.width = `${box.width}px`;
    node.style.height = `${box.height}px`;
  };
  /** Zelle unter dem Zeiger, an den Rändern geklammert (auch außerhalb des Scrollbereichs). */
  function pointToCell(x, y) {
    const tb = tbody();
    if (!tb || !nCols() || !nRows()) return null;
    const r = view.rowAtY(y - tb.getBoundingClientRect().top);
    let c = 0;
    headerCells().forEach((cell, i) => { if (x >= cell.getBoundingClientRect().left) c = i; });
    return { c: Math.min(c, nCols() - 1), r };
  }
  /** Holt eine Zelle in den Sichtbereich (unter den klebenden Kopf). */
  function revealCell(c, r) {
    const rh = view.rowHeight();
    const visible = el.clientHeight - headH();
    if (r * rh < el.scrollTop) view.scrollToRow(r);
    else if ((r + 1) * rh > el.scrollTop + visible) view.scrollToRow(((r + 1) * rh - visible) / rh);
    const box = colBox(c);
    if (box) {
      const rowHeadW = el.querySelector('thead th.datagrid__corner')?.getBoundingClientRect().width || 0;
      if (box.left - rowHeadW < el.scrollLeft) el.scrollLeft = Math.max(0, box.left - rowHeadW);
      else if (box.left + box.width > el.scrollLeft + el.clientWidth) el.scrollLeft = box.left + box.width - el.clientWidth;
    }
  }

  // ─── Markierung (nach jedem Zeichnen der Ansicht) ─────────────────

  function paint() {
    const rng = sel ? S.rangeOf(sel) : null;
    const fullWidth = rng && rng.c0 === 0 && rng.c1 === nCols() - 1;
    for (const tr of el.querySelectorAll('tbody tr[data-pool]')) {
      if (tr.hidden) continue;
      const cells = tr.children;
      const r = Number(cells[0].dataset.rowIdx);
      cells[0].classList.toggle('row-header-selected', Boolean(fullWidth && r >= rng.r0 && r <= rng.r1));
      for (let i = 1; i < cells.length; i++) {
        const c = i - 1;
        const td = cells[i];
        td.classList.toggle('cell-selected', S.contains(sel, c, r));
        td.classList.toggle('cell-active', Boolean(sel && sel.activeCol === c && sel.activeRow === r));
        td.classList.toggle('col-hover', hoverCol === c);
      }
    }
    const selCols = new Set(S.selectedColumns(sel));
    headerCells().forEach((cell, c) => {
      cell.classList.toggle('col-selected', selCols.has(c));
      cell.classList.toggle('col-hover', hoverCol === c);
    });
    const box = rng ? boxOf(rng.c0, rng.r0, rng.c1, rng.r1) : null;
    frame.hidden = !box;
    if (box) place(frame, box);
    fillHandle.hidden = !(sel && !sel.extraCols.length && !editor && can('fillRange'));
    if (editor) {
      const ebox = boxOf(editor.c, editor.r, editor.c, editor.r);
      if (ebox) place(editor.box, ebox);
    }
    if (drag?.kind === 'fill' || drag?.kind === 'move') placePreview();
  }
  view.onUpdate(paint);

  // ─── Zelleneditor ─────────────────────────────────────────────────

  /**
   * Öffnet den Editor (Doppelklick, F2, Tippen). Gesperrte Spalte: kein Editor, Meldung.
   * @param {number} c @param {number} r @param {string} [initialChar]
   */
  function startEdit(c, r, initialChar) {
    if (readOnly || !table) return;
    const col = columns[c];
    if (!col || r < 0 || r >= nRows()) return;
    if (col.lock) {
      blocked('cell:edit-blocked', col, { rowIndex: r });
      return;
    }
    if (!can('setCells') && !can('setFormula')) return;
    commitEdit(false);
    const formula = formulas[col.id]?.[r];
    const v = table.get(c, r);
    const initial = formula ?? (v == null ? '' : (typeof v === 'number' ? formatGridLossless(v, null, lang) : String(v)));
    const input = h('input', { class: 'cell-editor', type: 'text', spellcheck: 'false' });
    input.value = initialChar ?? initial;
    const box = h('div', { class: 'datagrid__editor' }, input);
    el.append(box);
    editor = { c, r, columnId: col.id, input, box, initial };
    if (initialChar === '=' || formula != null) showHint();
    input.addEventListener('input', () => { if (input.value.startsWith('=')) showHint(); });
    revealCell(c, r);
    paint();
    input.focus({ preventScroll: true });
    if (initialChar) input.setSelectionRange(1, 1); else input.select();
    input.addEventListener('blur', () => { if (editor?.input === input) commitEdit(false); });
  }

  /**
   * Hinweisknopf „=“ in der Editorbox (öffnet den Formel-Editor mit dem Editortext).
   * Höchstens einer je Editor; er verschwindet nur mit der Box.
   */
  function showHint() {
    if (!editor || features.formulaEditor !== true || !can('openFormulaEditor')) return;
    if (editor.box.querySelector('.fe-expand-hint')) return;
    const btn = h('button', { class: 'fe-expand-hint', type: 'button', title: t('ui.datagrid.formulaEditorHint') },
      icon('action.expand', { size: 'sm' }));
    // mousedown statt click: der Editor übernimmt sonst per blur.
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!editor) return;
      const ed = closeEditor(false);
      send('openFormulaEditor', { columnId: ed.columnId, row: ed.r, text: ed.input.value });
    });
    editor.box.append(btn);
  }

  function closeEditor(refocus) {
    const ed = editor;
    editor = null;
    if (refocus) el.focus({ preventScroll: true });
    ed.box.remove();
    paint();
    return ed;
  }

  /** Übernimmt den Editor: `=…` als Formel, sonst als Wert; unverändert meldet nichts. */
  function commitEdit(refocus = true) {
    if (!editor) return;
    const ed = closeEditor(refocus);
    const text = ed.input.value;
    if (text === ed.initial) return;
    if (text.trim().startsWith('=') && can('setFormula')) {
      send('setFormula', { columnId: ed.columnId, row: ed.r, formula: text.trim() });
    } else {
      send('setCells', { columnId: ed.columnId, startRow: ed.r, values: [text === '' ? null : text] });
    }
  }

  function cancelEdit() {
    if (editor) closeEditor(true);
  }

  function onEditorKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
      if (sel) setSel(S.moveBy(sel, 0, e.shiftKey ? -1 : 1, nCols(), nRows()));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
      if (sel) setSel(S.moveBy(sel, e.shiftKey ? -1 : 1, 0, nCols(), nRows()));
    } else if (shortcutRegistry.matches(e, 'datagrid.cancelEdit')) {
      e.preventDefault();
      cancelEdit();
    }
  }

  // ─── Spaltenname im Kopf ──────────────────────────────────────────

  function startHeaderEdit(c) {
    const col = columns[c];
    const cell = th(c);
    if (readOnly || !col || !cell || headerEdit || !can('renameColumn')) return;
    if (col.lock) {
      blocked('column:edit-blocked', col, { action: 'rename' });
      return;
    }
    commitEdit(false);
    const old = col.name || '';
    const input = h('input', { class: 'col-name-editor', type: 'text', placeholder: t('ui.datagrid.promptColumnName') });
    input.value = old;
    const nameEl = cell.querySelector('.col-name');
    if (nameEl) nameEl.replaceWith(input);
    else cell.querySelector('.col-resize-handle')?.before(input);
    headerEdit = { input, nameEl };
    const finish = () => {
      headerEdit = null;
      input.removeEventListener('blur', commit);
      if (nameEl && input.isConnected) input.replaceWith(nameEl); else input.remove();
      el.focus({ preventScroll: true });
    };
    function commit() {
      const name = input.value.trim();
      finish();
      if (name !== old) send('renameColumn', { columnId: col.id, name });
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); } else if (shortcutRegistry.matches(ev, 'datagrid.cancelEdit')) { ev.preventDefault(); finish(); }
    });
    input.addEventListener('mousedown', (ev) => ev.stopPropagation());
    input.focus();
    input.select();
  }

  // ─── Leeren, Einfügen, Kopieren ───────────────────────────────────

  /** Leert die Auswahl; gesperrte Spalten bleiben (Meldung wie `_clearSelection`). */
  function clear() {
    if (!sel || !can('clearRange')) return;
    const { c0, r0, c1, r1 } = S.rangeOf(sel);
    const locked = columns.slice(c0, c1 + 1).filter((col) => col.lock);
    if (locked.length) blocked('cell:edit-blocked', locked[0], { action: 'clear', startCol: c0, endCol: c1 });
    if (locked.length === c1 - c0 + 1) return;
    send('clearRange', { c0, r0, c1, r1 });
  }

  /** TSV der Auswahl (`exportToTSV`): Zahlen verlustfrei in der Sprache der Oberfläche. */
  function selectionTSV() {
    const { c0, r0, c1, r1 } = S.rangeOf(sel);
    const lines = [];
    for (let r = r0; r <= r1; r++) {
      const cells = [];
      for (let c = c0; c <= c1; c++) {
        const v = table.get(c, r);
        cells.push(typeof v === 'number' ? formatGridLossless(v, null, lang) : (v != null ? String(v) : ''));
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }

  /**
   * Meldet einen Block ab der linken oberen Auswahlzelle. Gesperrte
   * Zielspalten bleiben wie beim Ausfüllen stehen (Meldung `cell:edit-blocked`),
   * die übrigen werden geschrieben; sind alle Zielspalten gesperrt, nichts.
   */
  function pasteText(text) {
    if (!can('pasteBlock') || !nCols()) return;
    const own = text != null && text === lastGridCopy;
    const rows = parseClipboard(text || '', { keepBlank: own });
    if (!rows.length) return;
    const { c0, r0 } = sel ? S.rangeOf(sel) : { c0: 0, r0: 0 };
    const width = Math.max(...rows.map((r) => r.length));
    const locked = columns.slice(c0, c0 + width).filter((col) => col.lock);
    if (locked.length) blocked('cell:edit-blocked', locked[0], { action: 'paste' });
    // Spalten jenseits des Blattendes kommen ungesperrt dazu.
    if (locked.length === width) return;
    send('pasteBlock', { columnId: columns[c0].id, startRow: r0, rows, ...(own ? { header: false } : {}) });
  }

  const ownsClipboard = () => !editor && document.activeElement === el && featureOn('clipboard') && isShown(el);
  /** TSV der Auswahl, als eigene letzte Kopie gemerkt. */
  function copySelection() {
    lastGridCopy = selectionTSV();
    return lastGridCopy;
  }
  function onCopy(e) {
    if (!sel || !ownsClipboard()) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', copySelection());
  }
  function onCut(e) {
    if (!sel || !ownsClipboard()) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', copySelection());
    clear();
  }
  function onPaste(e) {
    if (!ownsClipboard() || !can('pasteBlock')) return;
    e.preventDefault();
    pasteText(e.clipboardData.getData('text/plain'));
  }
  /**
   * Strg+C/X/V lösen die DOM-Ereignisse `copy`/`cut`/`paste` aus. Liegt ein
   * Kürzel aus der Registry auf einer anderen Taste, geht es über die
   * asynchrone Zwischenablage.
   */
  function clipboardKey(e) {
    const native = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && ['c', 'x', 'v'].includes(e.key.toLowerCase());
    if (native || !featureOn('clipboard') || !navigator.clipboard) return false;
    if (shortcutRegistry.matches(e, 'datagrid.copy') || shortcutRegistry.matches(e, 'datagrid.cut')) {
      e.preventDefault();
      if (!sel) return true;
      const isCut = shortcutRegistry.matches(e, 'datagrid.cut');
      navigator.clipboard.writeText(copySelection()).then(() => { if (isCut) clear(); }, () => {});
      return true;
    }
    if (shortcutRegistry.matches(e, 'datagrid.paste')) {
      e.preventDefault();
      if (can('pasteBlock')) navigator.clipboard.readText().then(pasteText, () => {});
      return true;
    }
    return false;
  }

  // ─── Tastatur ─────────────────────────────────────────────────────

  function onKeyDown(e) {
    if (!isShown(el)) return;
    if ((drag?.kind === 'fill' || drag?.kind === 'move') && shortcutRegistry.matches(e, 'datagrid.cancelEdit')) {
      e.preventDefault();
      endDrag();
      return;
    }
    if (editor && e.target === editor.input) { onEditorKey(e); return; }
    if (e.target !== el) return;
    if (shortcutRegistry.matches(e, 'datagrid.selectAll')) {
      e.preventDefault();
      setSel(S.all(nCols(), nRows()), { reveal: false });
      return;
    }
    if (clipboardKey(e) || !sel) return;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dc, dr] = arrows[e.key];
      setSel(e.shiftKey ? S.extendBy(sel, dc, dr, nCols(), nRows()) : S.moveBy(sel, dc, dr, nCols(), nRows()));
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      setSel(S.moveBy(sel, e.shiftKey ? -1 : 1, 0, nCols(), nRows()));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      setSel(S.moveBy(sel, 0, e.shiftKey ? -1 : 1, nCols(), nRows()));
      return;
    }
    if (shortcutRegistry.matches(e, 'datagrid.clear')) {
      e.preventDefault();
      clear();
      return;
    }
    if (shortcutRegistry.matches(e, 'datagrid.editCell')) {
      e.preventDefault();
      startEdit(sel.activeCol, sel.activeRow);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      startEdit(sel.activeCol, sel.activeRow, e.key);
    }
  }

  // ─── Ziehen (Auswahl, Ausfüllen, Block, Breite, Zeile, Spalte) ────

  function beginDrag(d) {
    drag = d;
    document.addEventListener('mousemove', onDocMove);
    document.addEventListener('mouseup', onDocUp);
  }
  function endDrag() {
    const d = drag;
    drag = null;
    pointer = null;
    cancelAnimationFrame(autoRaf);
    autoRaf = 0;
    document.removeEventListener('mousemove', onDocMove);
    document.removeEventListener('mouseup', onDocUp);
    if (d?.kind === 'fill' || d?.kind === 'move') {
      fillPreview.style.display = 'none';
      el.classList.remove('datagrid--fill-dragging', 'datagrid--fill-ctrl', 'datagrid--cell-moving');
    }
    d?.ghost?.remove();
    d?.indicator?.remove();
    d?.handle?.classList.remove('active');
  }

  function edgeStep(p) {
    const r = el.getBoundingClientRect();
    const top = r.top + headH();
    const step = (dist) => Math.min(MAX_EDGE_STEP, Math.max(2, Math.round(dist / 2)));
    let dy = 0; let dx = 0;
    if (p.y < top + EDGE_ZONE) dy = -step(top + EDGE_ZONE - p.y);
    else if (p.y > r.bottom - EDGE_ZONE) dy = step(p.y - (r.bottom - EDGE_ZONE));
    if (drag.kind !== 'row') {
      if (p.x < r.left + EDGE_ZONE) dx = -step(r.left + EDGE_ZONE - p.x);
      else if (p.x > r.right - EDGE_ZONE) dx = step(p.x - (r.right - EDGE_ZONE));
    }
    if (drag.kind === 'col') dy = 0;
    return { dx, dy };
  }
  /** Scrollen am Rand, solange der Zeiger dort steht (Auswahl, Ausfüllen, Verschieben). */
  function autoScroll() {
    autoRaf = 0;
    if (!drag || !pointer) return;
    const { dx, dy } = edgeStep(pointer);
    if (!dx && !dy) return;
    const before = [el.scrollTop, el.scrollLeft];
    el.scrollTop += dy;
    el.scrollLeft += dx;
    if (before[0] === el.scrollTop && before[1] === el.scrollLeft) return;
    dragMove();
    autoRaf = requestAnimationFrame(autoScroll);
  }

  function onDocMove(e) {
    if (!drag) return;
    pointer = { x: e.clientX, y: e.clientY };
    if (drag.kind === 'fill') {
      drag.ctrl = Boolean(e.ctrlKey || e.metaKey);
      el.classList.toggle('datagrid--fill-ctrl', drag.ctrl);
    }
    if (drag.kind === 'rowPending' || drag.kind === 'colPending') {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) <= DRAG_THRESHOLD) return;
      if (drag.kind === 'rowPending') startRowDrag(e); else startColDrag(e);
    }
    dragMove();
    if (['select', 'fill', 'move', 'row', 'col'].includes(drag?.kind) && !autoRaf) autoRaf = requestAnimationFrame(autoScroll);
  }

  function dragMove() {
    if (!drag || !pointer) return;
    const p = pointer;
    if (drag.kind === 'resize') {
      const w = Math.round(Math.max(MIN_COL_WIDTH, drag.startW + p.x - drag.startX));
      if (colWidths[drag.columnId] !== w) {
        colWidths = { ...colWidths, [drag.columnId]: w };
        redraw();
      }
      return;
    }
    if (drag.kind === 'row') { updateRowDrag(p); return; }
    if (drag.kind === 'col') { updateColDrag(p); return; }
    const cell = pointToCell(p.x, p.y);
    if (!cell) return;
    if (drag.kind === 'select') {
      if (sel && (sel.endCol !== cell.c || sel.endRow !== cell.r)) setSel(S.extendTo(sel, cell.c, cell.r), { reveal: false });
    } else if (drag.kind === 'fill') {
      updateFill(cell);
    } else if (drag.kind === 'move') {
      updateMove(cell);
    }
  }

  function onDocUp() {
    const d = drag;
    if (!d) return;
    if (d.kind === 'fill') finishFill(d);
    else if (d.kind === 'move') finishMove(d);
    else if (d.kind === 'row') finishRowDrag(d);
    else if (d.kind === 'col') finishColDrag(d);
    endDrag();
    if (d.kind === 'resize') scheduleGridView();
  }

  // Ausfüllgriff (`_onFillHandleMouseDown`, `_updateFillDrag`, `_finishFillDrag`)
  function startFill(e) {
    if (!sel || !can('fillRange')) return;
    e.preventDefault();
    e.stopPropagation();
    commitEdit();
    const src = S.rangeOf(sel);
    beginDrag({ kind: 'fill', src, tgt: { ...src }, axis: null, ctrl: Boolean(e.ctrlKey || e.metaKey) });
    el.classList.add('datagrid--fill-dragging');
    placePreview();
  }
  function updateFill({ c, r }) {
    const { src } = drag;
    if (drag.axis == null) {
      const dC = Math.max(0, c - src.c1, src.c0 - c);
      const dR = Math.max(0, r - src.r1, src.r0 - r);
      if (!dC && !dR) { drag.tgt = { ...src }; placePreview(); return; }
      drag.axis = dR >= dC ? 'v' : 'h';
    }
    const tgt = { ...src };
    if (drag.axis === 'v') {
      if (r > src.r1) tgt.r1 = r; else if (r < src.r0) tgt.r0 = r;
    } else if (c > src.c1) tgt.c1 = c; else if (c < src.c0) tgt.c0 = c;
    drag.tgt = tgt;
    placePreview();
  }
  function placePreview() {
    const { tgt } = drag;
    const box = boxOf(tgt.c0, tgt.r0, tgt.c1, tgt.r1);
    if (!box) { fillPreview.style.display = 'none'; return; }
    place(fillPreview, box);
    fillPreview.style.display = 'block';
  }
  function finishFill({ src, tgt, ctrl }) {
    if (tgt.c0 === src.c0 && tgt.c1 === src.c1 && tgt.r0 === src.r0 && tgt.r1 === src.r1) return;
    const locked = columns.slice(tgt.c0, tgt.c1 + 1).find((col) => col.lock);
    if (locked) blocked('cell:edit-blocked', locked, { action: 'fill' });
    send('fillRange', { source: { ...src }, target: { ...tgt }, ctrl });
    setSel({ ...S.rect(tgt.c0, tgt.r0, tgt.c1, tgt.r1), activeCol: sel?.activeCol ?? tgt.c0, activeRow: sel?.activeRow ?? tgt.r0 }, { reveal: false });
  }

  // Block am Auswahlrand verschieben (`_isOnSelectionBorder`, `_startCellMoveDrag`, `_setCellMoveTarget`)
  /**
   * Liegt der Zeiger auf dem Rand der Auswahl — innerhalb des Blocks, höchstens
   * `CELL_MOVE_EDGE` px von einer Außenkante? Gerechnet in Inhaltskoordinaten
   * über `boxOf`, nicht über `td`-Rechtecke (gilt auch nach dem Scrollen).
   * @param {MouseEvent} e @returns {boolean}
   */
  function onBorder(e) {
    const td = /** @type {HTMLElement} */ (e.target).closest?.('tbody td[data-col-idx]');
    if (!td || td.classList.contains('datagrid__row-header')) return false;
    if (!sel || sel.extraCols.length || readOnly || !can('moveCells')) return false;
    const { c0, r0, c1, r1 } = S.rangeOf(sel);
    const box = boxOf(c0, r0, c1, r1);
    if (!box) return false;
    const er = el.getBoundingClientRect();
    const x = e.clientX - er.left - el.clientLeft + el.scrollLeft - box.left;
    const y = e.clientY - er.top - el.clientTop + el.scrollTop - box.top;
    if (x < 0 || y < 0 || x > box.width || y > box.height) return false;
    return x <= CELL_MOVE_EDGE || box.width - x <= CELL_MOVE_EDGE || y <= CELL_MOVE_EDGE || box.height - y <= CELL_MOVE_EDGE;
  }
  /** Greift den Block sofort (ohne Mindestweg); (c, r) ist die gegriffene Zelle. */
  function startMove(c, r) {
    const src = S.rangeOf(sel);
    el.classList.add('datagrid--cell-moving');
    beginDrag({ kind: 'move', src, grabCol: c - src.c0, grabRow: r - src.r0, tgt: { ...src } });
    placePreview();
  }
  /** Ziel = Zelle unter dem Zeiger minus Griffversatz, in das Blatt geklemmt (es wächst nicht). */
  function updateMove({ c, r }) {
    const { src, grabCol, grabRow } = drag;
    const w = src.c1 - src.c0;
    const hh = src.r1 - src.r0;
    const toCol = Math.max(0, Math.min(nCols() - 1 - w, c - grabCol));
    const toRow = Math.max(0, Math.min(nRows() - 1 - hh, r - grabRow));
    drag.tgt = { c0: toCol, r0: toRow, c1: toCol + w, r1: toRow + hh };
    placePreview();
  }
  /** Ziel = Quelle: nichts. Sperre in Quelle ∪ Ziel: Meldung, nichts gesendet. */
  function finishMove({ src, tgt }) {
    if (tgt.c0 === src.c0 && tgt.r0 === src.r0) return;
    const touched = new Set();
    for (let c = src.c0; c <= src.c1; c++) touched.add(c);
    for (let c = tgt.c0; c <= tgt.c1; c++) touched.add(c);
    const locked = [...touched].sort((a, b) => a - b).map((c) => columns[c]).find((col) => col?.lock);
    if (locked) {
      blocked('cell:edit-blocked', locked, { action: 'move' });
      return;
    }
    send('moveCells', { source: { ...src }, toCol: tgt.c0, toRow: tgt.r0 });
    setSel({ ...S.rect(tgt.c0, tgt.r0, tgt.c1, tgt.r1), activeCol: tgt.c0, activeRow: tgt.r0 }, { reveal: false });
  }

  // Zeile verschieben (`_startRowDrag` ff.)
  function startRowDrag(e) {
    const from = drag.r;
    const ghost = h('div', { class: 'row-drag-ghost', style: `left:${e.clientX + 12}px;top:${e.clientY - 10}px` }, String(from + 1));
    const indicator = h('div', { class: 'row-drag-indicator' });
    document.body.append(ghost);
    el.append(indicator);
    drag = { kind: 'row', from, to: from, ghost, indicator };
  }
  function updateRowDrag(p) {
    const rh = view.rowHeight();
    const tb = tbody();
    const to = Math.max(0, Math.min(nRows(), Math.round((p.y - tb.getBoundingClientRect().top) / rh)));
    drag.to = to;
    drag.ghost.style.left = `${p.x + 12}px`;
    drag.ghost.style.top = `${p.y - 10}px`;
    drag.indicator.style.top = `${bodyTop() + to * rh}px`;
    drag.indicator.style.display = 'block';
  }
  function finishRowDrag({ from, to }) {
    const toRow = to > from ? to - 1 : to;
    if (toRow !== from && toRow >= 0 && toRow < nRows()) send('moveRow', { fromRow: from, toRow });
  }

  // Spalte verschieben (`_startColDrag` ff.)
  function startColDrag(e) {
    const from = drag.c;
    const col = columns[from];
    const ghost = h('div', { class: 'col-drag-ghost', style: `left:${e.clientX + 12}px;top:${e.clientY - 10}px` },
      col.shortName + (col.name ? ` · ${col.name}` : ''));
    const indicator = h('div', { class: 'col-drag-indicator' });
    document.body.append(ghost);
    el.append(indicator);
    th(from)?.classList.add('col-dragging');
    drag = { kind: 'col', from, to: from, ghost, indicator };
  }
  function updateColDrag(p) {
    let to = nCols();
    headerCells().forEach((cell, i) => {
      const r = cell.getBoundingClientRect();
      if (to === nCols() && p.x < r.left + r.width / 2) to = i;
    });
    drag.to = to;
    drag.ghost.style.left = `${p.x + 12}px`;
    drag.ghost.style.top = `${p.y - 10}px`;
    const box = to < nCols() ? colBox(to) : colBox(nCols() - 1);
    if (box) {
      drag.indicator.style.left = `${to < nCols() ? box.left : box.left + box.width}px`;
      drag.indicator.style.top = '0px';
      drag.indicator.style.height = `${el.scrollHeight}px`;
      drag.indicator.style.display = 'block';
    }
  }
  function finishColDrag({ from, to }) {
    th(from)?.classList.remove('col-dragging');
    const toIndex = to > from ? to - 1 : to;
    if (toIndex !== from && toIndex >= 0 && toIndex < nCols()) send('moveColumn', { columnId: columns[from].id, toIndex });
  }

  // ─── Maus ─────────────────────────────────────────────────────────

  /** Shift+Klick auf den Spaltenkopf: aufsteigend → absteigend → ohne Zeiger (`sortByColumn`). */
  function sortByHeader(c, dir) {
    const col = columns[c];
    if (!col || !can('sortRows')) return;
    let next = dir;
    if (!next) {
      if (sortState?.columnId !== col.id) next = 'asc';
      else if (sortState.dir === 'asc') next = 'desc';
    }
    sortState = next ? { columnId: col.id, dir: next } : null;
    redraw();
    if (next) send('sortRows', { columnId: col.id, direction: next });
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('.datagrid__fill-handle')) { startFill(e); return; }
    if (target.closest('.datagrid__editor, .col-name-editor')) return;
    const resize = target.closest('.col-resize-handle');
    if (resize) {
      e.preventDefault();
      const c = Number(resize.dataset.colIdx);
      const col = columns[c];
      const box = colBox(c);
      if (!col || !box) return;
      resize.classList.add('active');
      beginDrag({ kind: 'resize', columnId: col.id, startX: e.clientX, startW: box.width, handle: resize });
      return;
    }
    const head = target.closest('thead th[data-col-idx]');
    if (head) {
      e.preventDefault();
      el.focus({ preventScroll: true });
      const c = Number(head.dataset.colIdx);
      if (e.ctrlKey || e.metaKey) {
        commitEdit(false);
        setSel(S.toggleColumn(sel, c, nRows()), { reveal: false });
      } else if (e.shiftKey) {
        sortByHeader(c);
      } else {
        commitEdit(false);
        setSel(S.column(c, nRows()), { reveal: false });
        if (target.closest('.col-id') && can('moveColumn')) beginDrag({ kind: 'colPending', c, x: e.clientX, y: e.clientY });
      }
      return;
    }
    const td = target.closest('tbody td');
    if (!td || td.dataset.rowIdx == null) return;
    e.preventDefault();
    commitEdit(false);
    el.focus({ preventScroll: true });
    const r = Number(td.dataset.rowIdx);
    if (td.classList.contains('datagrid__row-header')) {
      setSel(S.row(r, nCols()), { reveal: false });
      if (can('moveRow')) beginDrag({ kind: 'rowPending', r, x: e.clientX, y: e.clientY });
      return;
    }
    const c = Number(td.dataset.colIdx);
    // Vor Shift-Erweitern und vor „Klick auf die einzige markierte Zelle hebt sie auf“.
    if (!e.shiftKey && onBorder(e)) {
      startMove(c, r);
      return;
    }
    if (e.shiftKey && sel) {
      setSel(S.extendTo(sel, c, r), { reveal: false });
    } else if (S.isSingle(sel) && sel.activeCol === c && sel.activeRow === r) {
      setSel(null);
    } else {
      setSel(S.single(c, r), { reveal: false });
      beginDrag({ kind: 'select' });
    }
  }

  function onDblClick(e) {
    if (readOnly) return;
    const target = /** @type {HTMLElement} */ (e.target);
    const head = target.closest('thead th[data-col-idx]');
    if (head && !target.closest('.col-resize-handle')) { startHeaderEdit(Number(head.dataset.colIdx)); return; }
    const td = target.closest('tbody td[data-col-idx]');
    if (!td) return;
    const c = Number(td.dataset.colIdx);
    const r = Number(td.dataset.rowIdx);
    const col = columns[c];
    if (col && !col.lock && formulas[col.id]?.[r] != null && features.formulaEditor === true && can('openFormulaEditor')) {
      send('openFormulaEditor', { columnId: col.id, row: r });
      return;
    }
    startEdit(c, r);
  }

  /** Exportmenü am Eckknopf (`_showExportMenu` des Altrasters). @param {HTMLElement} btn */
  function openExportMenu(btn) {
    const r = btn.getBoundingClientRect();
    menus.open(r.left, r.bottom + 2, [
      { id: 'export-xlsx', label: 'Excel (.xlsx)', action: () => emit('exportAs', { format: 'xlsx' }) },
      { id: 'export-csv', label: 'CSV (.csv)', action: () => emit('exportAs', { format: 'csv' }) },
      { id: 'export-json', label: 'JSON (.json)', action: () => emit('exportAs', { format: 'json' }) },
    ]);
  }

  function onClick(e) {
    const exportBtn = /** @type {HTMLElement} */ (e.target).closest('thead .datagrid__export-btn');
    if (exportBtn && canExport) {
      e.stopPropagation();
      openExportMenu(/** @type {HTMLElement} */ (exportBtn));
      return;
    }
    const badge = /** @type {HTMLElement} */ (e.target).closest('thead .col-type-badge');
    if (!badge || readOnly) return;
    e.stopPropagation();
    const c = Number(badge.dataset.colIdx);
    const columnId = columns[c]?.id;
    if (!columnId) return;
    menus.openAttrPicker(badge.getBoundingClientRect(), {
      getCol: () => columns.find((col) => col.id === columnId) || null,
      can,
      setType: (columnType) => send('setColumnType', { columnId, columnType }),
      setRole: (role) => send('setColumnRole', { columnId, role }),
      setFormat: (key, value) => send('setColumnFormat', { columnId, key, value }),
    });
  }

  function columnViews(c) {
    const columnId = columns[c].id;
    const idx = () => columns.findIndex((col) => col.id === columnId);
    const stats = dialog && featureOn('stats')
      ? () => menus.showStats(columns[c], table.columns[c], table.rowCount) : null;
    const scan = dialog && featureOn('scan')
      ? () => menus.showScan({
        getCol: () => columns[idx()] || null,
        getValues: () => table.columns[idx()],
        getRowCount: () => table.rowCount,
        colIdx: idx,
        version: () => [table, table.rev, JSON.stringify(columns[idx()] ?? null)],
        jump: (cc, r) => setSel(S.single(cc, r)),
      }) : null;
    return { stats, scan };
  }

  function onContextMenu(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('.datagrid__editor, .col-name-editor')) return;
    const head = target.closest('thead th[data-col-idx]');
    if (head) {
      e.preventDefault();
      const c = Number(head.dataset.colIdx);
      const col = columns[c];
      if (!col) return;
      menus.open(e.clientX, e.clientY, menus.headerItems({
        col, readOnly, can,
        on: {
          rename: () => startHeaderEdit(c),
          sort: (dir) => sortByHeader(c, dir),
          insert: (offset) => send('addColumn', { position: c + offset }),
          remove: () => send('removeColumn', { columnId: col.id }),
          ...columnViews(c),
        },
      }));
      return;
    }
    const td = target.closest('tbody td');
    if (!td || td.dataset.rowIdx == null) return;
    e.preventDefault();
    if (readOnly) return;
    commitEdit(false);
    const r = Number(td.dataset.rowIdx);
    if (td.classList.contains('datagrid__row-header')) {
      menus.open(e.clientX, e.clientY, menus.rowItems({
        can,
        on: { insert: (offset) => send('addRows', { count: 1, position: r + offset }), remove: () => send('removeRows', { startRow: r, count: 1 }) },
      }));
      return;
    }
    const c = Number(td.dataset.colIdx);
    const col = columns[c];
    if (!S.contains(sel, c, r)) setSel(S.single(c, r), { reveal: false });
    menus.open(e.clientX, e.clientY, menus.cellItems({
      canEdit: Boolean(col && !col.lock && (can('setCells') || can('setFormula'))),
      can,
      extra: can('contextMenu') && contextMenu.length ? contextMenu.map((x) => ({ id: x.id, label: t(x.labelKey) })) : [],
      on: {
        edit: () => startEdit(c, r),
        clear,
        insert: (offset) => send('addRows', { count: 1, position: r + offset }),
        removeRows: () => {
          if (!sel) return;
          const rng = S.rangeOf(sel);
          send('removeRows', { startRow: rng.r0, count: rng.r1 - rng.r0 + 1 });
        },
        extra: (id) => send('contextMenu', { id, columnId: col.id, row: r }),
      },
    }));
  }

  function onMouseOver(e) {
    const cell = /** @type {HTMLElement} */ (e.target).closest('td[data-col-idx], th[data-col-idx]');
    const c = cell && !cell.classList.contains('datagrid__row-header') ? Number(cell.dataset.colIdx) : -1;
    if (c === hoverCol) return;
    hoverCol = c;
    paint();
  }
  /** Cursor `move` am Auswahlrand (ohne laufende Geste). */
  function onHoverMove(e) {
    if (drag) return;
    el.classList.toggle('datagrid--move-hover', onBorder(e));
  }
  function onMouseLeave() {
    el.classList.remove('datagrid--move-hover');
    if (hoverCol < 0) return;
    hoverCol = -1;
    paint();
  }

  const listeners = [
    ['mousedown', onMouseDown], ['dblclick', onDblClick], ['click', onClick], ['contextmenu', onContextMenu],
    ['keydown', onKeyDown], ['copy', onCopy], ['cut', onCut], ['paste', onPaste],
    ['mouseover', onMouseOver], ['mousemove', onHoverMove], ['mouseleave', onMouseLeave],
  ];
  for (const [type, fn] of listeners) el.addEventListener(type, fn);

  return {
    /**
     * Übernimmt Daten und Ansichtszustand und zeichnet. Auswahl und
     * Spaltenbreiten von außen gelten nur, wenn sie sich seit dem letzten
     * Aufruf geändert haben und nicht das Echo der eigenen Meldung sind.
     * @param {GridViewState} state
     */
    setView(state) {
      // Eingefügte, gelöschte oder neu geladene Zeilen können die Zeile des
      // offenen Editors verschieben: dann verwerfen statt in die falsche Zeile zu schreiben.
      const rowsShifted = state.table !== table || (state.table?.rowCount ?? 0) !== nRows();
      if (editor && rowsShifted) closeEditor(false);
      table = state.table;
      columns = state.columns || [];
      formulas = state.formulas || {};
      if (state.lang) lang = state.lang;
      const inW = JSON.stringify(state.colWidths || {});
      if (inW !== lastInWidths && inW !== lastSentWidths) colWidths = { ...(state.colWidths || {}) };
      lastInWidths = inW;
      const inS = JSON.stringify(state.selection ?? null);
      const taken = inS !== lastInSel && inS !== lastSentSel;
      if (taken) sel = state.selection ?? null;
      lastInSel = inS;
      sel = S.clampSelection(sel, nCols(), nRows());
      if (taken) announceSelection();
      if (editor && (columns[editor.c]?.id !== editor.columnId || editor.r >= nRows())) closeEditor(false);
      redraw();
      paint();
      menus.refresh();
    },
    /**
     * Meldet eine ausstehende Ansicht (Auswahl, Spaltenbreiten) sofort statt
     * nach der Entprellung — vor dem Speichern beim Verlassen.
     * @returns {boolean} ob eine Ansicht ausstand
     */
    flushView() {
      if (!gvTimer) return false;
      flushGridView();
      return true;
    },
    /**
     * Übernimmt eine offene Zellbearbeitung wie Enter (ohne die Auswahl zu
     * bewegen) — vor einem Agentenstapel (`settle` → `flushPendingWork`).
     * @returns {boolean} ob ein Editor offen war
     */
    commitEditor() {
      if (!editor) return false;
      commitEdit(false);
      return true;
    },
    /**
     * Bricht eine offene Zellbearbeitung ab, ohne zu schreiben, und liefert
     * ihren Text (F4 übergibt ihn dem Formel-Editor).
     * @returns {string|null} der Text, ohne offenen Editor `null`
     */
    takeEditorText() {
      if (!editor) return null;
      return closeEditor(false).input.value;
    },
    destroy() {
      if (gvTimer) flushGridView();
      endDrag();
      if (editor) closeEditor(false);
      menus.destroy();
      view.onUpdate(null);
      for (const [type, fn] of listeners) el.removeEventListener(type, fn);
      frame.remove();
      fillPreview.remove();
    },
  };
}
