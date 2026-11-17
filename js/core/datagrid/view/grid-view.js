/**
 * D.Mike — GridView (datagrid/view/grid-view.js)
 *
 * Virtualisiertes Zeichnen einer `TableData`: Kopf, Zeilenkopf, Zeilenpool und
 * Abstandhalter. Feste Zeilenhöhe (`--datagrid-row-height`), 10 Zeilen Puffer,
 * Text wird nur bei Änderung gesetzt, Spalten werden nicht virtualisiert.
 * Die Ansicht hält nur Ansichtszustand und verändert die Tabelle nie.
 *
 * Abstandhalter sind Tabellenzeilen im `tbody` (statt Pool per `transform`),
 * damit der klebende Kopf (`position: sticky`) über die volle Höhe haftet.
 */
import { h } from '../../dom.js';
import { icon } from '../../icon.js';
import { COLUMN_TYPES, isNumericType, formatCellValue, renderColTypeBadge } from '../datagrid-utils.js';
import { defaultRoleForType } from '../datagrid-roles.js';
import { evaluateFormula } from '../datagrid-formula.js';
import { formulaGrid } from '../table/formulas.js';

const BUFFER = 10;
const FALLBACK_ROW_H = 30;
const FALLBACK_VIEWPORT = 600;
const FALLBACK_COL_W = 130;
const EMPTY_FORMULAS = Object.freeze({});

/**
 * @typedef {{ id: string, name?: string, shortName?: string, type: string, unit?: string,
 *   format?: object, role?: string, roleManual?: boolean, lock?: string, reason?: string,
 *   managedBy?: string }} GridColumn
 */

/**
 * @param {HTMLElement} host Container
 * @param {{ t?: (key: string) => string, lang?: string }} [opts]
 * @returns {{ draw: Function, scrollToRow: (r: number) => void, cellAt: (c: number, r: number) => (HTMLElement|null),
 *   rowAtY: (y: number) => number, rowHeight: () => number, onUpdate: (fn: (() => void)|null) => void,
 *   el: HTMLElement, destroy: () => void }}
 */
export function createGridView(host, { t = (k) => k.split('.').pop(), lang = 'en' } = {}) {
  const scroll = h('div', { class: 'datagrid__scroll' });
  const table = h('table', { class: 'datagrid__table datagrid__table--virtual' });
  const thead = h('thead');
  const tbody = h('tbody');
  table.append(thead, tbody);
  scroll.append(table);
  host.append(scroll);

  const topSpacer = h('tr', { class: 'datagrid__spacer' }, h('td'));
  const topPad = h('tr', { hidden: true }); // hält die Streifenparität (nth-child) wie im Altgitter
  const bottomSpacer = h('tr', { class: 'datagrid__spacer' }, h('td'));
  tbody.append(topSpacer, topPad, bottomSpacer);

  /** @type {{tr: HTMLElement, cells: HTMLElement[], rowIdx: number}[]} */
  let pool = [];
  let table_ = null;
  let cols = /** @type {GridColumn[]} */ ([]);
  let formulas = {};
  let viewState = {};
  let lastRev = -1;
  let lastTable = null;
  let lastFormulas = null;
  let lastSig = '';
  let lastLang = lang;
  let curLang = lang;
  let first = -1;
  let count = -1;
  let dirty = true;
  /** @type {null|(() => void)} */
  let onUpdateHook = null;

  const rowH = () => {
    // CSS-Länge in Pixeln (`30px`), kein Zahlformat der Oberfläche
    const v = Number(getComputedStyle(scroll).getPropertyValue('--datagrid-row-height').trim().replace(/px$/, ''));
    return v > 0 ? v : FALLBACK_ROW_H;
  };
  const defColW = () => {
    const v = parseInt(getComputedStyle(scroll).getPropertyValue('--datagrid-default-col-width'), 10);
    return v > 0 ? v : FALLBACK_COL_W;
  };

  const typeLabel = (type) => {
    const key = `type${type.charAt(0).toUpperCase()}${type.slice(1)}`;
    const s = t(`ui.datagrid.${key}`);
    return (s && s !== key && !s.endsWith(key)) ? s : (COLUMN_TYPES[type]?.label || type);
  };
  const roleLabel = (role) => {
    const key = `role${role.charAt(0).toUpperCase()}${role.slice(1)}`;
    const s = t(`ui.datagrid.${key}`);
    return (s && s !== key && !s.endsWith(key)) ? s : role;
  };
  const lockTooltip = (col) => {
    if (!col.lock) return '';
    const tt = (k) => t(`ui.datagrid.${k}`);
    const head = col.lock === 'hard' ? tt('lockHardTitle') : tt('lockSoftTitle');
    const reason = col.reason ? tt(`lockReason.${col.reason}`) : null;
    const managed = col.managedBy ? `${tt('lockManagedBy')}: ${col.managedBy}` : null;
    return [head, reason, managed].filter(Boolean).join(' — ');
  };

  const headerSig = () => JSON.stringify([
    cols.map((c) => [c.id, c.name, c.shortName, c.type, c.unit, c.role, c.roleManual, c.lock, c.reason, c.managedBy, c.format]),
    viewState.colWidths || null, viewState.sortCol ?? null, viewState.sortDir ?? null, curLang,
    viewState.cornerExport === true,
  ]);
  const colWidth = (col) => (viewState.colWidths && viewState.colWidths[col.id]) || defColW();

  function renderHeader() {
    const colgroup = h('colgroup', null,
      h('col', { style: 'width:var(--datagrid-row-header-width)' }),
      ...cols.map((col) => h('col', { style: `width:${colWidth(col)}px` })));
    table.querySelector('colgroup')?.remove();
    table.prepend(colgroup);
    // Ecke: Exportknopf wie im Altraster (`_renderHeader`), nur mit `cornerExport`.
    const corner = h('th', { class: 'datagrid__row-header datagrid__corner' });
    if (viewState.cornerExport === true) {
      corner.append(h('div', { class: 'datagrid__corner-btns' },
        h('button', { class: 'datagrid__export-btn', type: 'button', title: t('app.export') }, icon('action.download'))));
    }
    const tr = h('tr', { class: 'datagrid__column-header' }, corner);
    cols.forEach((col, i) => {
      const roleKey = col.role || defaultRoleForType(col.type);
      let badgeTitle = `${typeLabel(col.type)} · ${roleLabel(roleKey)}`;
      if (col.roleManual) {
        const suffix = t('ui.datagrid.roleManualSuffix');
        badgeTitle += ` ${(suffix && suffix !== 'roleManualSuffix') ? suffix : '(manual)'}`;
      }
      const typeTag = h('span', {
        class: `col-type-badge col-role-${roleKey}${col.roleManual ? ' col-type-badge--role-manual' : ''}`,
        'data-col-idx': i,
        title: badgeTitle,
      }, renderColTypeBadge(col.type));
      const sortClass = viewState.sortCol === i ? (viewState.sortDir === 'asc' ? ' sorted-asc' : ' sorted-desc') : '';
      const lockClass = col.lock ? ` col-locked col-locked--${col.lock}` : '';
      const th = h('th', { 'data-col-idx': i, class: `${sortClass}${lockClass}`.trim() || null });
      th.append(h('span', { class: 'col-id' }, col.shortName ?? ''), ' ', typeTag, ' ');
      if (col.lock) {
        th.append(h('span', { class: 'col-lock-icon', title: lockTooltip(col) },
          icon(col.lock === 'hard' ? 'action.lock' : 'action.unlock')));
      }
      if (col.name) {
        const nameSpan = h('span', { class: 'col-name' }, col.name);
        if (col.unit) nameSpan.append(' ', h('span', { class: 'col-unit' }, `[${col.unit}]`));
        th.append(nameSpan);
      }
      th.append(h('div', { class: 'col-resize-handle', 'data-col-idx': i }));
      tr.append(th);
    });
    thead.replaceChildren(tr);
  }

  function buildPool(size) {
    for (const p of pool) p.tr.remove();
    pool = [];
    for (let i = 0; i < size; i++) {
      const tr = h('tr', { 'data-pool': '' });
      const rh = h('td', { class: 'datagrid__row-header' });
      const cells = [rh];
      tr.append(rh);
      for (let c = 0; c < cols.length; c++) {
        const td = h('td', { 'data-col-idx': c });
        cells.push(td);
        tr.append(td);
      }
      bottomSpacer.before(tr);
      pool.push({ tr, cells, rowIdx: -1 });
    }
  }

  function setText(td, s) {
    if (td._txt !== s) { td._txt = s; td.textContent = s; }
  }
  function setClass(td, s) {
    if (td._cls !== s) { td._cls = s; td.className = s; }
  }
  function setTitle(td, s) {
    if (td._ttl !== s) {
      td._ttl = s;
      if (s) td.title = s; else td.removeAttribute('title');
    }
  }

  const normCols = () => cols.map((c) => (c.format ? c : { ...c, format: {} }));
  let ncols = [];
  /** Rechengitter für Formelfehler, je Zeichnen höchstens einmal gebaut. */
  let fgrid = null;

  function fillRow(p, r) {
    const tr = p.tr;
    if (tr.hidden) tr.hidden = false;
    if (p.rowIdx !== r) {
      p.rowIdx = r;
      p.cells[0].dataset.rowIdx = String(r);
    }
    setText(p.cells[0], String(r + 1));
    for (let c = 0; c < cols.length; c++) {
      const td = p.cells[c + 1];
      const col = ncols[c];
      if (td.dataset.rowIdx !== String(r)) td.dataset.rowIdx = String(r);
      const val = table_.get(c, r);
      const formula = formulas[col.id]?.[r];
      let cls = 'datagrid__cell';
      if (isNumericType(col.type)) cls += ' cell-numeric';
      let title = '';
      if (col.lock) { cls += ` cell-locked cell-locked--${col.lock}`; title = lockTooltip(col); }
      let text = val == null ? '' : formatCellValue(col, val, curLang);
      if (formula) {
        // Ein Rechenfehler steht im Model als null: die Zelle zeigt den Fehlercode (wie das Altraster).
        const error = val == null ? evaluateFormula(formula, fgrid ??= formulaGrid(cols, table_)).error : null;
        if (error) { cls += ' cell-formula-error'; title = `${formula} \u2192 ${error}`; text = error; } else { cls += ' cell-formula'; title = formula; }
      }
      setClass(td, cls);
      setTitle(td, title);
      setText(td, text);
    }
  }

  function update() {
    if (!table_) return;
    const rh = rowH();
    const n = table_.rowCount;
    const vh = scroll.clientHeight || FALLBACK_VIEWPORT;
    // +1: Reserve, weil der gerade Start das Fenster um eine Zeile nach oben schieben kann
    const size = Math.min(n, Math.ceil(vh / rh) + 2 * BUFFER + 1);
    if (pool.length !== size || (pool[0] && pool[0].cells.length !== cols.length + 1)) {
      buildPool(size);
      dirty = true;
    }
    let f = Math.max(0, Math.floor(scroll.scrollTop / rh) - BUFFER);
    f -= f % 2; // gerader Start hält die Streifen stabil
    // Obergrenze n-(size-1): nach dem Abrunden auf gerade gilt n-f <= size, das Ende wird bei jeder Parität erreicht
    f = Math.min(f, Math.max(0, n - (size - 1)));
    f -= f % 2;
    if (!dirty && f === first && size === count) return;
    const rows = Math.min(size, n - f);
    fgrid = null;
    const prevFirst = first;
    first = f; count = size;
    if (prevFirst !== f) for (const p of pool) p.rowIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      if (i < rows) fillRow(pool[i], f + i);
      else if (!pool[i].tr.hidden) pool[i].tr.hidden = true;
    }
    const span = cols.length + 1;
    topSpacer.firstChild.colSpan = span;
    bottomSpacer.firstChild.colSpan = span;
    const topH = f * rh;
    const bottomH = Math.max(0, n - f - rows) * rh;
    topSpacer.firstChild.style.height = `${topH}px`;
    bottomSpacer.firstChild.style.height = `${bottomH}px`;
    // Eine leere Zelle mit height:0 bliebe 1 px hoch und schöbe alle Zeilen
    // gegenüber dem Altraster nach unten. Verborgen zählt die Zeile für
    // nth-child (Streifen) weiter mit.
    topSpacer.hidden = topH === 0;
    bottomSpacer.hidden = bottomH === 0;
    dirty = false;
    onUpdateHook?.();
  }

  const onScroll = () => update();
  scroll.addEventListener('scroll', onScroll, { passive: true });
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(onScroll) : null;
  resizeObserver?.observe(scroll);

  return {
    /** Scrollbereich; Bedienung (grid-input.js) hört hier und legt Rahmen und Editor hinein. */
    el: scroll,
    /** @returns {number} Zeilenhöhe in Pixeln (`--datagrid-row-height`) */
    rowHeight: rowH,
    /**
     * Rückruf nach jedem Zeichnen, das Zellen neu belegt hat (Scrollen, `draw`).
     * Die Bedienung markiert dort die Auswahl an den Poolzellen.
     * @param {(() => void)|null} fn
     */
    onUpdate(fn) { onUpdateHook = fn; },
    /**
     * Zeichnet Kopf und sichtbare Zeilen; unveränderte Eingaben (gleiche `rev`) setzen keinen Text neu.
     * @param {import('../../table-data.js').TableData} tbl
     * @param {GridColumn[]} columns Spaltenköpfe
     * @param {Record<string, Record<string, string>>} f Formeln je Spalten-Id und Zeile
     * @param {{ colWidths?: Record<string, number>, sortCol?: number, sortDir?: string, lang?: string,
     *   cornerExport?: boolean }} [view] `cornerExport`: Exportknopf in der Ecke
     */
    draw(tbl, columns, f, view = {}) {
      cols = columns || [];
      viewState = view || {};
      if (viewState.lang) curLang = viewState.lang;
      formulas = f || EMPTY_FORMULAS;
      ncols = normCols();
      const sig = headerSig();
      if (sig !== lastSig) { lastSig = sig; renderHeader(); dirty = true; }
      if (tbl !== lastTable || tbl.rev !== lastRev || formulas !== lastFormulas || curLang !== lastLang) dirty = true;
      lastTable = tbl; lastRev = tbl.rev; lastFormulas = formulas; lastLang = curLang;
      table_ = tbl;
      const digits = String(tbl.rowCount || 1).length;
      host.style.setProperty('--datagrid-row-header-width', `${Math.max(36, digits * 9 + 24)}px`);
      update();
    },
    /** @param {number} r Datenzeile, die in den Sichtbereich rückt */
    scrollToRow(r) {
      scroll.scrollTop = Math.max(0, r) * rowH();
      update();
    },
    /** @returns {HTMLElement|null} Zelle, falls die Zeile gerade im Pool steht */
    cellAt(c, r) {
      const p = pool.find((x) => x.rowIdx === r && !x.tr.hidden);
      return p ? p.cells[c + 1] || null : null;
    },
    /** @param {number} y Pixel ab Oberkante der ersten Zeile (Scrollinhalt) @returns {number} Datenzeile */
    rowAtY(y) {
      const n = table_ ? table_.rowCount : 0;
      return Math.max(0, Math.min(n - 1, Math.floor(y / rowH())));
    },
    destroy() {
      onUpdateHook = null;
      scroll.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
      scroll.remove();
      pool = [];
    },
  };
}
