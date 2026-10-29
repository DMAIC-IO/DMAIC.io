/**
 * D.Mike — Worksheet Module (worksheet.js)
 *
 * DMAIC-independent data table — the central DataHub every chart/test module
 * reads from. Migrated to createModule + Alpine CSP.
 *
 * Architecture:
 *  - Model (worksheet-model.js) owns sheet metadata + opaque per-sheet DataGrid
 *    state blobs (the persistence shape consumed by other modules).
 *  - The toolbar, sheet-tab bar and formula-editor overlay *shell* are declarative
 *    (Alpine template). The heavy components stay IMPERATIVE and are mounted into
 *    [data-ref] anchors: DataGrid, FormulaEditor, the role-confirm popout, and the
 *    formula-expand hint.
 *
 * 🔴 EVENT CONTRACT IS FROZEN. Emits `worksheet:dataChanged` (debounced ~150ms),
 *    `chart-suggestion:load`, `module:added`, `module:activated`. Listens to
 *    `worksheet:appendColumn`. Same payload shapes as the legacy module.
 *
 * @agent  Vollständig über das Viewmodel steuerbar: CSV-Import, Zellblöcke
 *   und Formeln schreiben, Spalten anlegen, umbenennen und entfernen,
 *   Zeilen einfügen und entfernen, Zeilen nach einer Spalte sortieren,
 *   Rückgängig, Blätter anlegen, wechseln, umbenennen, duplizieren, davor
 *   einfügen und entfernen; Spaltenrollen setzen und bestätigen; Zeilen und
 *   Spalten verschieben, Spaltentyp und Anzeigeformat setzen. Dateidialoge,
 *   Popout-Widgets und die Auswahl-abhängigen Knöpfe bleiben der UI
 *   vorbehalten; gelesen wird über read() mit erklärter Lesefläche
 *   (AgentRead).
 */

import { createModule } from '../../core/template-module.js';
import Alpine from '@alpinejs/csp';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireKnownId, requireText, requireIndex, requireEnum, requireNumber } from '../../core/agent/agent-argcheck.js';
import { COLUMN_TYPES, DATE_FORMATS, TIME_FORMATS } from '../../core/datagrid/datagrid-utils.js';
import { State } from './worksheet-model.js';
import { DataGrid, isFormula, evaluateFormula } from '../../core/datagrid/datagrid.js';
import { ALL_ROLES, validRolesForType, isRoleValidForType } from '../../core/datagrid/datagrid-roles.js';
import { bridgeEmitter } from '../../core/tips/tip-engine.js';
import { shortcutRegistry } from '../../core/shortcut-registry.js';
import { h } from '../../core/dom.js';
import { icon } from '../../core/icon.js';
import { uid } from '../../core/uid.js';
import { debounce } from '../../core/debounce.js';
import { applyAppendColumn } from '../../core/worksheet-append.js';

/**
 * Format-Schlüssel, die die Oberfläche setzt — genau die Auswahl des
 * Format-Pickers (`datagrid.js` `_renderAttrPickerFormatColumn`), je
 * Spaltentyp. `currencySymbol` bietet die Oberfläche nicht an.
 */
const FORMAT_KEYS = ['decimals', 'dateFormat', 'timeFormat'];
const FORMAT_KEYS_BY_TYPE = Object.freeze({
  numeric: ['decimals'], currency: ['decimals'], percent: ['decimals'],
  date: ['dateFormat'], time: ['timeFormat'],
});

// ═══════════════════════════════════════════════════════════
//  FORMULA EDITOR (imperative — bound to the live DataGrid)
//  The editor body is built once and lives in a hidden holder; open()
//  lends it to the dialog service (dialog.form), which owns the window,
//  title bar, ✕, Escape, overlay and the Cancel / Apply buttons.
// ═══════════════════════════════════════════════════════════

class FormulaEditor {
  /**
   * @param {DataGrid} grid
   * @param {HTMLElement} holderEl hidden [data-ref="fe-holder"] the content lives in while closed
   * @param {Function} t i18n helper (bare keys → modules.worksheet.*)
   * @param {Function} toast
   * @param {object} dialog the dialog service
   */
  constructor(grid, holderEl, t, toast, dialog) {
    this.grid = grid;
    this._t = t;
    this._toast = toast;
    this._dialog = dialog;
    this._targetCell = null;
    this._open = false;
    this._api = null;
    this.root = this._buildHTML(t);
    holderEl.replaceChildren(this.root);
    this.textarea = this.root.querySelector('.formula-editor__textarea');
    this.previewVal = this.root.querySelector('.formula-editor__preview-value');
    this.colsBar = this.root.querySelector('.formula-editor__cols-bar');
    this._bindUI();
  }

  get isOpen() { return this._open; }

  /**
   * Open the editor for one cell.
   * @param {number} colIdx
   * @param {number} rowIdx
   * @param {string} [initialFormula] text to start with instead of the cell's formula
   */
  open(colIdx, rowIdx, initialFormula) {
    if (this._open) return;
    this.grid._cancelEdit();
    this._targetCell = { colIdx, rowIdx };
    this._open = true;
    const col = this.grid.columns[colIdx];
    const cellRef = `${col ? col.shortName : 'C?'}[${rowIdx + 1}]`;
    const hasCustomName = col && col.name && col.name !== col.shortName;
    const cellLabel = hasCustomName
      ? `${this._t('feCell')} ${cellRef} · ${col.name}`
      : `${this._t('feCell')} ${cellRef}`;
    const existingFormula = col?.formulas?.[rowIdx];
    this.textarea.value = initialFormula != null ? initialFormula : (existingFormula || '=');
    this._renderColPills();
    this._dialog.form({
      title: `${this._t('formulaEditor')} — ${cellLabel}`,
      size: 'wide',
      content: this.root,
      confirmLabel: this._t('feApply'),
      cancelLabel: this._t('cancel'),
      onMount: (_body, api) => {
        this._api = api;
        requestAnimationFrame(() => {
          this.textarea.focus();
          const len = this.textarea.value.length;
          this.textarea.setSelectionRange(len, len);
          this._updatePreview();
        });
      },
      onConfirm: () => this._apply(),
    }).then(() => {
      this._open = false;
      this._targetCell = null;
      this._api = null;
      // Return focus to body so grid keyboard shortcuts work immediately
      document.activeElement?.blur();
    });
  }

  /** Close without applying. */
  close() { this._api?.cancel(); }

  _bindUI() {
    this.textarea.addEventListener('input', () => this._updatePreview());
    this.textarea.addEventListener('keydown', (e) => {
      if (shortcutRegistry.matches(e, 'worksheet.applyFormula')) { e.preventDefault(); this._api?.confirm(); }
      if (e.key !== 'Escape') e.stopPropagation();   // Escape belongs to the dialog
    });

    // Simple chips (no dropdown)
    this.root.querySelectorAll('.fn-chip:not(.fn-chip--has-menu)').forEach(chip => {
      chip.addEventListener('click', () => {
        const insert = chip.dataset.insert || '';
        const cursorOffset = parseInt(chip.dataset.cursor ?? '-1');
        const selectLen = parseInt(chip.dataset.selectLen ?? '0');
        this._insertAtCursor(insert, cursorOffset, selectLen);
      });
    });

    const closeAllMenus = () => {
      this.root.querySelectorAll('.fn-chip-group--open').forEach(g => g.classList.remove('fn-chip-group--open'));
    };

    this.root.querySelectorAll('.fn-chip--has-menu').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const group = trigger.closest('.fn-chip-group');
        const wasOpen = group.classList.contains('fn-chip-group--open');
        closeAllMenus();
        if (!wasOpen) {
          group.classList.add('fn-chip-group--open');
          const menu = group.querySelector('.fn-chip-group__menu');
          const chipRect = trigger.getBoundingClientRect();
          menu.style.top = `${chipRect.bottom + 4  }px`;
          menu.style.left = `${chipRect.left  }px`;
          menu.style.right = '';
          requestAnimationFrame(() => {
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.right > window.innerWidth - 8) {
              menu.style.left = 'auto';
              menu.style.right = `${window.innerWidth - chipRect.right  }px`;
            }
          });
        }
      });
    });

    this.root.querySelectorAll('.fn-chip-group__item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const insert = item.dataset.insert || '';
        const cursorOffset = parseInt(item.dataset.cursor ?? '-1');
        const selectLen = parseInt(item.dataset.selectLen ?? '0');
        closeAllMenus();
        this._insertAtCursor(insert, cursorOffset, selectLen);
      });
    });

    this.root.addEventListener('click', closeAllMenus);
  }

  _renderColPills() {
    this.colsBar.querySelectorAll('.col-ref-pill').forEach(p => p.remove());
    this.colsBar.querySelectorAll('.col-pills-empty').forEach(p => p.remove());

    const cols = this.grid.columns;
    if (cols.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'col-pills-empty';
      empty.style.cssText = 'font-size:11px;color:var(--color-text-tertiary);font-style:italic';
      empty.textContent = this._t('feNoCols');
      this.colsBar.appendChild(empty);
      return;
    }

    for (const col of cols) {
      const insertText = col.name ? `'${col.name}'` : col.shortName;
      const pill = document.createElement('span');
      pill.className = 'col-ref-pill';
      pill.title = `${this._t('feInsertAs')} ${insertText}  (${col.shortName} · ${col.type})`;
      // col.name / col.shortName are user-typed → build via h() so they land in
      // textContent (escaped natively); never as parsed HTML. Fixes column-name XSS.
      if (col.name) {
        pill.replaceChildren(
          h('span', null, col.name),
          h('span', { class: 'col-ref-pill__short' }, col.shortName),
        );
      } else {
        pill.replaceChildren(h('span', null, col.shortName));
      }
      pill.addEventListener('click', () => this._insertAtCursor(insertText));
      this.colsBar.appendChild(pill);
    }
  }

  _insertAtCursor(text, cursorBack, selectLen) {
    const ta = this.textarea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);

    let pos;
    if (cursorBack != null && cursorBack !== -1 && !isNaN(cursorBack)) {
      pos = start + cursorBack;
    } else {
      pos = text.endsWith(')') ? start + text.length - 1 : start + text.length;
    }
    ta.focus();
    const selEnd = selectLen > 0 ? pos + selectLen : pos;
    ta.setSelectionRange(pos, selEnd);
    this._updatePreview();
  }

  _updatePreview() {
    const raw = this.textarea.value.trim();
    const pv = this.previewVal;

    if (!raw || raw === '=') {
      pv.textContent = '—';
      pv.className = 'formula-editor__preview-value empty';
      this.textarea.classList.remove('has-error');
      return;
    }

    if (!isFormula(raw)) {
      pv.textContent = raw;
      pv.className = 'formula-editor__preview-value ok';
      this.textarea.classList.remove('has-error');
      return;
    }

    const { result, error } = evaluateFormula(raw, this.grid);
    if (error) {
      pv.textContent = error;
      pv.className = 'formula-editor__preview-value error';
      this.textarea.classList.add('has-error');
    } else {
      pv.textContent = result == null ? `(${this._t('feEmpty')})` : String(result);
      pv.className = 'formula-editor__preview-value ok';
      this.textarea.classList.remove('has-error');
    }
  }

  /** @returns {boolean} false keeps the editor open (commit threw). */
  _apply() {
    if (!this._targetCell) return true;
    const { colIdx, rowIdx } = this._targetCell;
    const raw = this.textarea.value.trim();
    const col = this.grid.columns[colIdx];
    if (!col) return true;
    let written;
    try {
      // Same sink as the cell editor and the agent facade: lock, history
      // (old/new formula) and `cell:changed` in one place. A value without
      // "=" also gets the cell editor's type detection.
      written = this.grid.setCellFormula(col.id, rowIdx, raw);
    } catch (err) {
      this._toast(err.message, 'error');
      return false;
    }
    this.grid.render();
    // Locked column: nothing written, `cell:edit-blocked` was emitted — no
    // success toast, the editor closes.
    if (!written) return true;
    this.grid.setSelection({
      startCol: colIdx, startRow: rowIdx, endCol: colIdx, endRow: rowIdx,
      activeCol: colIdx, activeRow: rowIdx,
    });
    this._toast(this._t('formulaApplied'), 'success');
    return true;
  }

  destroy() { this.close(); }

  /**
   * Build the formula-editor body (lent to the dialog service on open).
   * Returns a live HTMLElement built with h() — no HTML-string sink.
   * Every class / data-* attribute the POM + _bindUI selectors rely on
   * is preserved verbatim.
   */
  _buildHTML(t) {
    // A simple function chip: <span class="fn-chip …" data-insert=… …>label</span>
    const chip = (cls, { insert, cursor, selectLen, title } = {}, label) =>
      h('span', {
        class: `fn-chip ${cls}`,
        'data-insert': insert,
        'data-cursor': cursor,
        'data-select-len': selectLen,
        title,
      }, label);

    // A dropdown menu item: <span class="fn-chip-group__item" data-…>NAME — desc</span>
    const item = ({ insert, cursor, selectLen }, label) =>
      h('span', {
        class: 'fn-chip-group__item',
        'data-insert': insert,
        'data-cursor': cursor,
        'data-select-len': selectLen,
      }, label);

    // A chip with a dropdown menu.
    const menuChip = (cls, triggerLabel, items) =>
      h('span', { class: 'fn-chip-group' },
        h('span', { class: `fn-chip ${cls} fn-chip--has-menu` },
          `${triggerLabel} `, icon('nav.expand-down', { size: 'sm', cls: 'fn-chip__arrow' })),
        h('span', { class: 'fn-chip-group__menu' }, ...items));

    const fnBar = h('div', { class: 'formula-editor__fn-bar' },
      h('div', { class: 'formula-editor__fn-label' }, t('feFunctions')),
      chip('fn-chip--stat', { insert: 'SUM()', cursor: -1, title: t('fnSum') }, 'SUM'),
      chip('fn-chip--stat', { insert: 'AVERAGE()', cursor: -1, title: t('fnAvg') }, 'AVG'),
      menuChip('fn-chip--stat', 'COUNT', [
        item({ insert: 'COUNT()', cursor: -1 }, `COUNT — ${t('fnCount')}`),
        item({ insert: 'COUNTA()', cursor: -1 }, `COUNTA — ${t('fnCounta')}`),
        item({ insert: 'COUNTIF(col; > x)', cursor: 8, selectLen: 3 }, `COUNTIF — ${t('fnCountif')}`),
        item({ insert: 'SUMIF(col; > x)', cursor: 6, selectLen: 3 }, `SUMIF — ${t('fnSumif')}`),
      ]),
      chip('fn-chip--stat', { insert: 'MIN()', cursor: -1, title: t('fnMin') }, 'MIN'),
      chip('fn-chip--stat', { insert: 'MAX()', cursor: -1, title: t('fnMax') }, 'MAX'),
      chip('fn-chip--sigma', { insert: 'STDEV()', cursor: -1, title: t('fnStdev') }, 'STDEV'),
      chip('fn-chip--sigma', { insert: 'VAR()', cursor: -1, title: t('fnVar') }, 'VAR'),
      chip('fn-chip--sigma', { insert: 'MEDIAN()', cursor: -1, title: t('fnMedian') }, 'MEDIAN'),
      chip('fn-chip--sigma', { insert: 'MODE()', cursor: -1, title: t('fnMode') }, 'MODE'),
      menuChip('fn-chip--sigma', 'QUANTILE', [
        item({ insert: 'PERCENTILE(col; p)', cursor: 11, selectLen: 3 }, `PERCENTILE — ${t('fnPercentile')}`),
        item({ insert: 'QUARTILE(col; q)', cursor: 9, selectLen: 3 }, `QUARTILE — ${t('fnQuartile')}`),
        item({ insert: 'IQR()', cursor: -1 }, `IQR — ${t('fnIqr')}`),
        item({ insert: 'RANGE()', cursor: -1 }, `RANGE — ${t('fnRange')}`),
        item({ insert: 'SKEW()', cursor: -1 }, `SKEW — ${t('fnSkew')}`),
        item({ insert: 'KURT()', cursor: -1 }, `KURT — ${t('fnKurt')}`),
      ]),
      menuChip('fn-chip--sigma', 'Cp/Cpk', [
        item({ insert: 'CP(col; LSL; USL)', cursor: 3, selectLen: 3 }, `CP — ${t('fnCp')}`),
        item({ insert: 'CPK(col; LSL; USL)', cursor: 4, selectLen: 3 }, `CPK — ${t('fnCpk')}`),
        item({ insert: 'CPKUP(col; USL)', cursor: 6, selectLen: 3 }, `CPKUP — ${t('fnCpkUp')}`),
        item({ insert: 'CPKLO(col; LSL)', cursor: 6, selectLen: 3 }, `CPKLO — ${t('fnCpkLo')}`),
      ]),
      chip('fn-chip--logic', { insert: 'IF(cond; then; else)', cursor: 3, selectLen: 4, title: t('fnIf') }, 'IF'),
      chip('fn-chip--logic', { insert: 'AND(a; b)', cursor: 4, selectLen: 1, title: t('fnAnd') }, 'AND'),
      chip('fn-chip--logic', { insert: 'OR(a; b)', cursor: 3, selectLen: 1, title: t('fnOr') }, 'OR'),
      chip('fn-chip--logic', { insert: 'NOT()', cursor: -1, title: t('fnNot') }, 'NOT'),
      chip('fn-chip--math', { insert: 'ABS()', cursor: -1, title: t('fnAbs') }, 'ABS'),
      chip('fn-chip--math', { insert: 'MOD(x; n)', cursor: 4, selectLen: 1, title: t('fnMod') }, 'MOD'),
      chip('fn-chip--math', { insert: 'SIGN()', cursor: -1, title: t('fnSign') }, 'SIGN'),
      chip('fn-chip--math', { insert: 'CONCAT(a; b)', cursor: 7, selectLen: 1, title: t('fnConcat') }, 'CONCAT'),
      menuChip('fn-chip--math', 'ROUND', [
        item({ insert: 'ROUND(x; n)', cursor: 6, selectLen: 1 }, `ROUND — ${t('fnRound')}`),
        item({ insert: 'ROUNDUP(x; n)', cursor: 8, selectLen: 1 }, `ROUNDUP — ${t('fnRoundUp')}`),
        item({ insert: 'ROUNDDOWN(x; n)', cursor: 10, selectLen: 1 }, `ROUNDDOWN — ${t('fnRoundDown')}`),
      ]),
      chip('fn-chip--math', { insert: 'SQRT()', cursor: -1, title: t('fnSqrt') }, '√'),
      chip('fn-chip--math', { insert: 'POWER(base; exp)', cursor: 6, selectLen: 4, title: t('fnPower') }, 'xⁿ'),
      chip('fn-chip--math', { insert: 'PI()', cursor: -1, title: t('fnPi') }, 'π'),
      menuChip('fn-chip--math', 'LOG', [
        item({ insert: 'LN()', cursor: -1 }, `LN — ${t('fnLn')}`),
        item({ insert: 'LOG(x; base)', cursor: 4, selectLen: 1 }, `LOG — ${t('fnLog')}`),
        item({ insert: 'EXP()', cursor: -1 }, `EXP — ${t('fnExp')}`),
      ]),
      menuChip('fn-chip--trig', 'SIN', [
        item({ insert: 'SIN()', cursor: -1 }, `SIN — ${t('fnSin')}`),
        item({ insert: 'SIND()', cursor: -1 }, `SIND — ${t('fnSind')}`),
        item({ insert: 'ASIN()', cursor: -1 }, `ASIN — ${t('fnAsin')}`),
        item({ insert: 'ASIND()', cursor: -1 }, `ASIND — ${t('fnAsind')}`),
      ]),
      menuChip('fn-chip--trig', 'COS', [
        item({ insert: 'COS()', cursor: -1 }, `COS — ${t('fnCos')}`),
        item({ insert: 'COSD()', cursor: -1 }, `COSD — ${t('fnCosd')}`),
        item({ insert: 'ACOS()', cursor: -1 }, `ACOS — ${t('fnAcos')}`),
        item({ insert: 'ACOSD()', cursor: -1 }, `ACOSD — ${t('fnAcosd')}`),
      ]),
      menuChip('fn-chip--trig', 'TAN', [
        item({ insert: 'TAN()', cursor: -1 }, `TAN — ${t('fnTan')}`),
        item({ insert: 'TAND()', cursor: -1 }, `TAND — ${t('fnTand')}`),
        item({ insert: 'ATAN()', cursor: -1 }, `ATAN — ${t('fnAtan')}`),
        item({ insert: 'ATAND()', cursor: -1 }, `ATAND — ${t('fnAtand')}`),
        item({ insert: 'ATAN2(y; x)', cursor: 6, selectLen: 1 }, `ATAN2 — ${t('fnAtan2')}`),
      ]),
      chip('fn-chip--trig', { insert: 'RAD()', cursor: -1, title: t('fnRad') }, 'RAD'),
      chip('fn-chip--trig', { insert: 'DEG()', cursor: -1, title: t('fnDeg') }, 'DEG'),
    );

    const refRow = (syntaxNodes, desc) =>
      h('tr', null, h('td', { class: 'fe-ref-syntax' }, ...syntaxNodes), h('td', null, desc));

    const body = h('div', { class: 'formula-editor__body' },
      h('div', { class: 'formula-editor__textarea-wrap' },
        h('textarea', {
          class: 'formula-editor__textarea',
          placeholder: t('fePlaceholder'),
          spellcheck: 'false',
          autocomplete: 'off',
        })),
      h('div', { class: 'formula-editor__preview' },
        h('span', { class: 'formula-editor__preview-label' }, t('fePreview')),
        h('span', { class: 'formula-editor__preview-value empty' }, '—')),
      h('div', { class: 'formula-editor__ref-guide' },
        h('div', { class: 'formula-editor__ref-guide-title' }, t('feRefGuideTitle')),
        h('table', { class: 'formula-editor__ref-table' },
          refRow([h('code', null, 'C2'), ' ', h('code', null, `'${t('feRefExampleName')}'`)], t('feRefCol')),
          refRow([h('code', null, 'C2[5]'), ' ', h('code', null, `'${t('feRefExampleName')}'[5]`)], t('feRefCell')),
          refRow([h('code', null, 'C1:C3'), ' ', h('code', null, "'A':'C'")], t('feRefRange')),
          refRow([h('code', null, 'C1[2]:C3[5]'), ' ', h('code', null, "'A'[2]:'C'[5]")], t('feRefCellRange')),
        ),
        h('table', { class: 'formula-editor__ref-table formula-editor__ref-table--sep' },
          refRow([h('code', null, 'SUM(C1; C3)'), ' ', h('code', null, `IF(C1 > 10; "${t('feRefYes')}"; "${t('feRefNo')}")`)], t('feRefSep')),
        ),
      ),
      h('div', { class: 'formula-editor__help' },
        h('kbd', null, 'Ctrl+Enter'), ` ${t('feApply')} \u00A0\u00B7\u00A0 `,
        h('kbd', null, 'Esc'), ` ${t('cancel')}`),
    );

    return h('div', { class: 'formula-editor' },
      fnBar,
      h('div', { class: 'formula-editor__cols-bar' },
        h('div', { class: 'formula-editor__cols-label' }, t('feColumnRefs'))),
      body);
  }
}

// ═══════════════════════════════════════════════════════════
//  MODULE
// ═══════════════════════════════════════════════════════════

/**
 * Die Agenten-Lesefläche der Datensammlung.
 *
 * Nicht die persistierte Form: die ist `sheets: [{ id, name, state }]` mit
 * dem OPAKEN DataGrid-Blob in `state` — für einen Agenten entweder nutzlos
 * (ein Blob) oder riesig (5000 Zeilen in jeder Antwort). Darum erklärt dieses
 * Modul seine Lesefläche: Blattverzeichnis, aktives
 * Blatt, Spaltenköpfe des aktiven Blatts — und die Zeilen als Massendaten,
 * die nur auf ausdrückliche Nachfrage mitkommen.
 *
 * @typedef {object} AgentRead
 * @property {Array<{ id: string, name: string }>} sheets  all sheets of the workbook, in tab order
 * @property {string|null} activeSheetId  id of the sheet the following columns and rows belong to
 * @property {Array<{ id: string, name: string, shortName: string, type: string, unit: string|null, role: string|null, roleConfirmed: boolean, format: { decimals?: number, dateFormat?: string, timeFormat?: string } }>} columns  the column headers of the active sheet; `id` is the columnId of a column reference; `roleConfirmed` is true once the role was set or confirmed by hand or via setColumnRole; `format` holds the display format keys set for the column (absent key = the type's default)
 * @property {any[][]} rows  [bulk] the data rows of the active sheet, each row in column order
 * @property {Array<{ columnId: string, row: number, formula: string }>} formulas  [bulk] which cells of the active sheet are COMPUTED, not typed; a plain value written over one of them deletes the formula
 */
const mod = createModule({
  config: {
    id: 'worksheet',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.worksheet',
    version: '1.0.0',
    meta: import.meta,
    // Worksheet (central DataHub) owns ALL persistence itself: the debounced
    // _persistAndNotify (grid edits, 150ms) and _flushAndNotify / _persistStructural
    // (immediate, structural sheet ops). Opt out of the generic persist-$watch so the
    // entire (opaque, large) workbook is not deep-cloned twice per mutation. Every
    // state-changing path below persists explicitly — see _flushAndNotify /
    // _persistStructural / _persistAndNotify.
    manualPersist: true,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state ─────────────────────────────────
      _grid: null,
      _formulaEditor: null,
      /** @type {{cancel: Function}|null} api of the open role confirmation */
      _roleConfirmApi: null,
      _unsubs: [],
      _boundKeyDown: null,
      _onDocClick: null,
      _onAppendColumn: null,
      _autoSave: null,
      _persistAndNotify: null,
      /** Ein Grid-Ereignis wartet im Entpreller `_persistAndNotify`. */
      _persistPending: false,
      /** Ein Render wartet im Entpreller `_autoSave`. */
      _autoSavePending: false,
      canUndo: false,
      canRedo: false,
      canSuggest: false,
      exportOpen: false,
      roleDraft: [],
      renamingId: null,
      renameValue: '',
      // Reactive nonce — bumped on grid render/selection so the status-bar
      // x-text expressions (which read the non-reactive _grid) re-evaluate.
      statusTick: 0,

      // ── i18n / view helpers ──────────────────────────────────
      /** @noagent view transform (tooltip) */
      formulaBtnTitle: () => `${_t('formulaEditor')} (F4)`,
      /** @noagent view transform (tooltip) */
      suggestBtnTitle() {
        return this.canSuggest ? _t('suggestChartTitle') : _t('suggestChartNoSelection');
      },
      /** @noagent view transform (help text) */
      refExampleCode: () => `'${_t('feRefExampleName')}'`,
      /** @noagent view transform (help text) */
      refIfExample: () => `IF(C1 > 10; "${_t('feRefYes')}"; "${_t('feRefNo')}")`,

      /** @noagent view transform (status bar) */
      statusDims() {
        void this.statusTick; // reactive dependency
        if (!this._grid) return '';
        return _t('statusDims', { cols: this._grid.columns.length, rows: this._grid.rowCount });
      },
      /** @noagent view transform (status bar) */
      statusSelection() {
        void this.statusTick; // reactive dependency
        const g = this._grid;
        if (!g || !g.selection) return '';
        const s = g.selection;
        const rows = Math.abs(s.endRow - s.startRow) + 1;
        const cols = Math.abs(s.endCol - s.startCol) + 1;
        return rows * cols > 1
          ? _t('statusSelection', { rows, cols })
          : `${g.columns[s.activeCol]?.shortName || '?'}[${s.activeRow + 1}]`;
      },

      // ── Toolbar handlers ─────────────────────────────────────
      /**
       * Undo the last grid edit.
       *
       * `DataGrid.undo()` kehrt bei leerer Historie STILL zurück. Die
       * Oberfläche kann diesen Zustand nicht erreichen — ihr Knopf trägt
       * `:disabled="!canUndo"` —, ein Agent schon, und er bekam Erfolg für
       * nichts gemeldet. Geprüft wird genau die Marke des Knopfs; eine leere
       * Historie ist eine fachliche Absage, kein ungültiges Argument, und
       * wird deshalb zurückgegeben statt geworfen.
       *
       * @agent
       * @returns {boolean} `true`, wenn ein Schritt zurückgenommen wurde;
       *   `false` bei leerer Historie — dann ist nichts passiert.
       */
      undo() {
        if (!this.canUndo) return false;
        this._grid.undo();
        this._persistNow();
        return true;
      },
      /**
       * Redo the last undone grid edit.
       *
       * Dieselbe Absage wie bei `undo()`: ohne zurückgenommenen Schritt gibt
       * es nichts wiederherzustellen, und der Knopf der Oberfläche ist
       * `disabled`.
       *
       * @agent
       * @returns {boolean} `true`, wenn ein Schritt wiederhergestellt wurde;
       *   `false` bei leerer Redo-Historie — dann ist nichts passiert.
       */
      redo() {
        if (!this.canRedo) return false;
        this._grid.redo();
        this._persistNow();
        return true;
      },
      /**
       * Add an empty column to the active sheet — appended, or inserted at a
       * position like "insert column left/right" in the header menu.
       *
       * The toolbar button calls `addColumn()` without an argument (Alpine
       * CSP) and appends, as before.
       *
       * @agent
       * @param {number} [position] zero-based index the new column takes;
       *   0 puts it first, read().columns.length (or omitted) appends
       * @returns {string} id of the new column (see read().columns[].id)
       * @throws {Error} if position is not an integer in 0..column count
       */
      addColumn(position) {
        // `DataGrid.addColumn` spleißt ungeprüft: 99 hängte still hinten an,
        // -1 fügte VOR der letzten Spalte ein, 'x' ebenfalls irgendwo.
        if (position !== undefined) {
          requireIndex('position', position, (this._grid?.columns ?? []).length);
        }
        const col = this._grid.addColumn(position === undefined ? {} : { position });
        this._persistNow();
        return col.id;
      },
      /**
       * Rename a column. Formulas that refer to the old name are rewritten;
       * a name another column already has gets a suffix (" (2)"); "" clears
       * the name so the short name (C1, …) is shown. Undo restores it.
       *
       * @agent
       * @param {string} columnId id of the column (see read().columns[].id)
       * @param {string} name the new name
       * @returns {string} the name the column actually has now
       * @throws {Error} if no column has this id, if name is not a string, or
       *   if the column is locked
       */
      renameColumn(columnId, name) {
        // `DataGrid.renameColumn` kehrt bei unbekannter id und bei JEDER
        // Sperre still zurück — der Agent bekäme Erfolg gemeldet. Das
        // Kopfmenü bietet Umbenennen bei einer Sperre gar nicht erst an.
        requireKnownId('columnId', columnId, (this._grid?.columns ?? []).map(c => c.id));
        requireText('name', name);
        const col = this._grid.getColumn(columnId);
        if (col.meta?.lock) {
          throw new Error(`column "${columnId}" is locked (${col.meta.lock})`);
        }
        this._grid.renameColumn(columnId, name);
        this._persistNow();
        return col.name;
      },
      /**
       * Remove a column with its values and formulas. Undo restores it.
       *
       * @agent
       * @param {string} columnId id of the column (see read().columns[].id)
       * @returns {void}
       * @throws {Error} if no column has this id, or if the column is
       *   hard-locked (a soft lock allows removal, as in the header menu)
       */
      removeColumn(columnId) {
        // `DataGrid.removeColumn` kehrt bei unbekannter id und bei harter
        // Sperre still zurück. Eine weiche Sperre blockt hier bewusst nicht:
        // das Kopfmenü bietet „Spalte löschen“ dann ebenfalls an.
        requireKnownId('columnId', columnId, (this._grid?.columns ?? []).map(c => c.id));
        const col = this._grid.getColumn(columnId);
        if (col.meta?.lock === 'hard') {
          throw new Error(`column "${columnId}" is locked (hard)`);
        }
        this._grid.removeColumn(columnId);
        this._persistNow();
      },
      /**
       * Insert empty rows into the active sheet — appended, or at a position
       * like "insert row above/below" in the row menu.
       *
       * The toolbar button calls `addRows()` without an argument (Alpine CSP
       * allows no argument expressions in `@click`) and lands on the 10 it
       * always added.
       *
       * @agent
       * @param {number} [count] how many rows, a whole number of at least 1;
       *   omitted → 10, like the toolbar button
       * @param {number} [position] zero-based row index the first new row
       *   takes; 0 puts them first, the row count (or omitted) appends
       * @returns {void}
       * @throws {Error} if count is not a whole number ≥ 1, or position is not
       *   an integer in 0..row count
       */
      addRows(count, position) {
        // Früher klemmte diese Methode still: negativ → 0 Zeilen, Unsinn → 10,
        // und der Aufruf meldete Erfolg. `DataGrid.addRows` prüft nichts —
        // ein negatives count wirft dort erst in `new Array`, eine Position
        // 99 hängt still an.
        const n = count === undefined ? 10 : requireNumber('count', count, { min: 1, integer: true });
        if (position !== undefined) {
          requireIndex('position', position, this._grid?.rowCount ?? 0);
        }
        this._grid.addRows(n, position);
        this._persistNow();
      },

      /**
       * Remove a contiguous block of rows from the active sheet, values and
       * formulas included — like "delete row" / "delete selected rows" in
       * the row menu. Undo restores them.
       *
       * @agent
       * @param {number} startRow zero-based index of the first row to remove
       * @param {number} count how many rows, from 1 up to the rows left from
       *   startRow to the end
       * @returns {number} how many rows were removed
       * @throws {Error} if startRow is not an existing row index, or count is
       *   not a whole number in 1..(row count − startRow)
       */
      removeRows(startRow, count) {
        // `DataGrid.removeRows` prüft keinen Bereich: ein Index hinter dem
        // Ende spliced ins Leere, `rowCount` sinkt trotzdem. Eine Sperre
        // prüft das Zeilenmenü nicht — hier also auch nicht.
        const rowCount = this._grid?.rowCount ?? 0;
        requireIndex('startRow', startRow, rowCount, { existing: true });
        const n = requireNumber('count', count, { min: 1, max: rowCount - startRow, integer: true });
        const indices = Array.from({ length: n }, (_, i) => startRow + i);
        this._grid.removeRows(indices);
        this._persistNow();
        return indices.length;
      },
      /**
       * Sort all rows of the active sheet by one column — "Sort ascending /
       * descending" in the column header menu. The direction is absolute
       * (a second identical call changes nothing); empty cells go last.
       * Undo restores the previous order.
       *
       * @agent
       * @param {string} columnId id of the column to sort by (see read().columns[].id)
       * @param {'asc'|'desc'} direction ascending or descending
       * @returns {boolean} false if the rows already were in that order
       * @throws {Error} if no column has this id or direction is neither
       *   'asc' nor 'desc'
       */
      sortRows(columnId, direction) {
        // `DataGrid.sortByColumn` kehrt bei ungültigem Index still zurück und
        // schaltet ohne Richtung um — der Agent wählt sie darum absolut.
        const ids = (this._grid?.columns ?? []).map(c => c.id);
        requireKnownId('columnId', columnId, ids);
        requireEnum('direction', direction, ['asc', 'desc']);
        const changed = this._grid.sortByColumn(ids.indexOf(columnId), direction);
        // Sortieren sendet kein Datenereignis (nur `render`): ohne sofortiges
        // Ablegen spiegelte erst der 2-s-`_autoSave` das Blatt, und die
        // Laufzeit hielte den nächsten Schreibzugriff des Agenten für
        // veraltet. Auch bei `false` — die Kopfkennzeichnung hat sich geändert.
        this._persistNow();
        return changed;
      },
      /** @noagent selection-bound: clears the current UI selection */
      deleteSelection() { this._grid?._clearSelection(); },

      /** @noagent DOM event handler (dropdown toggle) */
      toggleExport(event) { event?.stopPropagation(); this.exportOpen = !this.exportOpen; },
      /** @noagent downloads a file; an agent reads the data via read() */
      exportAs(fmt) {
        this.exportOpen = false;
        if (fmt === 'xlsx') this._grid?.downloadXLSX();
        else if (fmt === 'csv') this._grid?.downloadCSV();
        else if (fmt === 'json') this._grid?.downloadJSON();
      },

      /** @noagent opens the OS file dialog */
      triggerImport() {
        module._container.querySelector('[data-ref="file-input"]')?.click();
      },
      /** @noagent DOM event handler (file input) */
      onFileChange(event) {
        const file = event.target.files[0];
        if (file) this._grid?._handleFileImport(file);
        event.target.value = '';
      },

      /** @noagent opens an imperative popout widget */
      openFormulaEditor() {
        const sel = this._grid?.selection;
        if (!sel) { this._toast(_t('selectCellFirst'), 'error'); return; }
        this._formulaEditor.open(sel.activeCol, sel.activeRow);
      },

      /** @noagent opens the chart-suggestion popout */
      suggestChart() { this._openChartSuggestion(); },

      // ── Sheet tab handlers ───────────────────────────────────
      /**
       * Add a new sheet and make it active.
       * @agent
       * @returns {string} id of the created sheet
       */
      addSheet() {
        this._syncActiveSheet();
        // Numbered default name, e.g. "Sheet 2" — counter is bumped inside addSheet,
        // so the new sheet's number is the next counter value.
        this.model.addSheet(`${_t('defaultSheetName')} ${this.model.sheetCounter + 1}`);
        this._applyActiveSheetToGrid();
        this._flushAndNotify();
        return this.model.activeSheetId;
      },
      /**
       * Switch to another sheet. The following read() calls refer to it.
       * @agent
       * @param {string} id id of the sheet to show
       * @returns {void}
       * @throws {Error} if no sheet has this id
       */
      switchSheet(id) {
        // Vor jeder Wirkung prüfen: `State.setActive` ignoriert eine
        // unbekannte id still, der Ablauf liefe aber weiter bis
        // `_applyActiveSheetToGrid()` — und das lädt den unveränderten
        // Zustand neu und LÖSCHT dabei die Rückgängig-Historie des Grids,
        // während der Aufruf Erfolg meldet.
        requireKnownId('sheet id', id, this.model.sheets.map(s => s.id));
        if (id === this.model.activeSheetId) return;
        this._syncActiveSheet();
        this.model.setActive(id);
        this._applyActiveSheetToGrid();
        // The activeSheetId change must be persisted explicitly now that the generic
        // persist-$watch is opted out (config.manualPersist). Persist-only: the legacy
        // auto-watch persisted without emitting dataChanged for a sheet switch, and
        // switching does not change any sheet's cell data — preserve that event surface.
        this._persistStructural();
      },

      /** @noagent DOM event handler (tab double click) */
      onTabDblClick(event) {
        const tab = event.target.closest('.sheet-tab');
        if (!tab) return;
        this._startRename(tab.dataset.sheetId);
      },
      _startRename(id) {
        const sheet = this.model.sheets.find(s => s.id === id);
        if (!sheet) return;
        this.renamingId = id;
        this.renameValue = sheet.name;
        this.$nextTick(() => {
          const input = module._container.querySelector('.sheet-tab__editor');
          if (input) { input.focus(); input.select(); }
        });
      },
      /**
       * Rename a sheet. The ONE sink for a sheet name — the inline rename in
       * the tab bar lands here too, so the agent cannot reach a state the UI
       * cannot (and vice versa).
       *
       * @agent
       * @param {string} id id of the sheet to rename
       * @param {string} name the new name; must not be empty or whitespace only
       * @returns {void}
       * @throws {Error} if no sheet has this id, or if `name` is empty or
       *   whitespace only
       */
      renameSheet(id, name) {
        // `State.renameSheet` kehrt bei unbekannter id still zurück; ohne
        // diese Prüfung meldete der Aufruf Erfolg und feuerte dataChanged,
        // ohne irgendetwas umbenannt zu haben.
        requireKnownId('sheet id', id, this.model.sheets.map(s => s.id));
        // `State.renameSheet` verwirft einen leeren Namen STILL und behielt
        // den alten — der Aufruf kam als `void` zurück, und ein Agent konnte
        // nicht unterscheiden, ob umbenannt wurde oder nicht. Ein leerer
        // Name ist ein ungültiges ARGUMENT und wirft, wie die unbekannte id
        // eine Zeile höher.
        if (String(name ?? '').trim() === '') {
          throw new Error(`empty sheet name for id "${id}"; a sheet name must contain a non-space character`);
        }
        this.model.renameSheet(id, name);
        this._flushAndNotify();
      },
      /**
       * @noagent commits the inline rename buffer; a thin wrapper around
       *   renameSheet(), which is what the agent calls.
       */
      commitRename() {
        if (this.renamingId == null) return;
        const id = this.renamingId;
        const name = this.renameValue;
        this.renamingId = null;
        // Das Blatt kann zwischen Umbenennen-Start und @blur verschwunden
        // sein (Kontextmenü „Blatt löschen"). Für die UI ist das kein
        // Fehler, nur nichts zu tun — `renameSheet()` würde werfen.
        if (!this.model.sheets.some(s => s.id === id)) return;
        // Ein geleertes Eingabefeld ist für die UI ein Abbruch, kein Fehler:
        // der alte Name bleibt. `renameSheet()` würde hier werfen.
        if (String(name ?? '').trim() === '') return;
        this.renameSheet(id, name);
      },
      /** @noagent DOM event handler (rename keyboard) */
      onRenameKeydown(event) {
        if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
        else if (event.key === 'Escape') {
          event.preventDefault();
          this.renamingId = null; // discard
        }
        event.stopPropagation();
      },

      /** @noagent opens a context menu with confirmations */
      onTabContextMenu(event) {
        const tab = event.target.closest('.sheet-tab');
        if (!tab) return;
        event.preventDefault();
        const sheetId = tab.dataset.sheetId;
        this._grid._showContextMenu(event.clientX, event.clientY, [
          { label: _t('renameSheet'), action: () => this._startRename(sheetId) },
          { label: _t('duplicateSheet'), action: () => this.duplicateSheet(sheetId) },
          { type: 'sep' },
          { label: _t('insertSheetBefore'), action: () => this.insertSheetBefore(sheetId) },
          { type: 'sep' },
          { label: _t('deleteSheet'), danger: true, action: () => this._removeSheetFromMenu(sheetId) },
        ]);
      },

      /**
       * Duplicate a sheet (cells, formulas, column settings) and make the
       * copy active. The copy is appended at the end and named
       * "<name> (Copy)".
       *
       * @agent
       * @param {string} id id of the sheet to copy
       * @returns {string} id of the copy, now the active sheet
       * @throws {Error} if no sheet has this id
       */
      duplicateSheet(id) {
        // `State.duplicateSheet` liefert bei unbekannter id still `null`; der
        // Ablauf liefe weiter bis `_applyActiveSheetToGrid()` und meldete
        // Erfolg, ohne etwas kopiert zu haben.
        requireKnownId('sheet id', id, this.model.sheets.map(s => s.id));
        this._syncActiveSheet();
        this.model.duplicateSheet(id, _t('sheetCopy'));
        this._applyActiveSheetToGrid();
        this._flushAndNotify();
        return this.model.activeSheetId;
      },

      /**
       * Insert an empty sheet directly before another sheet and make it
       * active.
       *
       * @agent
       * @param {string} id id of the sheet the new one is placed before
       * @returns {string} id of the new sheet, now the active sheet
       * @throws {Error} if no sheet has this id
       */
      insertSheetBefore(id) {
        // `State.insertSheetBefore` liefert bei unbekannter id still `null`.
        requireKnownId('sheet id', id, this.model.sheets.map(s => s.id));
        this._syncActiveSheet();
        this.model.insertSheetBefore(id, `${_t('defaultSheetName')} ${this.model.sheetCounter + 1}`);
        this._applyActiveSheetToGrid();
        this._flushAndNotify();
        return this.model.activeSheetId;
      },

      /**
       * Remove a sheet. If it was active, the neighbouring sheet becomes
       * active. A workbook keeps at least one sheet.
       *
       * @agent
       * @param {string} id id of the sheet to remove
       * @returns {void}
       * @throws {Error} if no sheet has this id, or if it is the last sheet
       */
      removeSheet(id) {
        // `State.removeSheet` antwortet in beiden Fällen nur mit `false` —
        // ohne eigene Prüfung meldete der Aufruf Erfolg.
        requireKnownId('sheet id', id, this.model.sheets.map(s => s.id));
        if (this.model.sheets.length <= 1) {
          throw new Error(`last sheet "${id}" cannot be removed; a workbook keeps at least one sheet`);
        }
        // Erst das lebende Grid in das aktive Blatt spiegeln: bleibt es aktiv
        // (ein ANDERES Blatt wird entfernt), lädt `_applyActiveSheetToGrid()`
        // sonst den zuletzt abgelegten Stand neu und verwirft, was noch nicht
        // gespiegelt war — etwa eine Sortierung, die nur `render` auslöst und
        // erst nach dem 2-s-`_autoSave` abgelegt würde.
        this._syncActiveSheet();
        this.model.removeSheet(id);
        this._applyActiveSheetToGrid();
        this._flushAndNotify();
      },

      /**
       * @noagent context-menu wrapper around removeSheet(): the last sheet is
       *   a toast for the user, not an error.
       */
      _removeSheetFromMenu(id) {
        if (this.model.sheets.length <= 1) { this._toast(_t('lastSheetError'), 'error'); return; }
        this.removeSheet(id);
      },

      // ── Grid ↔ Model sync ────────────────────────────────────

      /** Serialize the live grid into the active sheet's opaque state blob. */
      _syncActiveSheet() {
        const active = this.model.getActiveSheet();
        if (active && this._grid) active.state = this._grid.getState();
      },
      /** Load the active sheet's state into the live grid (or clear). */
      _applyActiveSheetToGrid() {
        const active = this.model.getActiveSheet();
        if (active?.state) this._grid.setState(active.state);
        else this._grid.clearAll();
      },

      // ── Agentenfläche ────────────────────────────────────────

      /**
       * Den Lesezustand der Datensammlung liefern.
       *
       * Ohne Parameter kommen die Zeilen UND die Formeln je als
       * Umfangs-Deskriptor (`{ $bulk: true, rowCount, columns }`); mit
       * `{ fields: ['rows'] }` bzw. `{ fields: ['formulas'] }` vollständig
       * und mit `{ fields: ['rows'], rows: { from: 0, to: 50 } }` als
       * Ausschnitt.
       *
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} the read state of the active sheet
       */
      read(options) {
        // Eine Oberflächenänderung, die noch in einem Entpreller wartet,
        // vorher ablegen: sonst landete sie nach dem Vermerk der Revision, die
        // dieses Lesen setzt, und der nächste Schreibzugriff wäre veraltet.
        this.flushPendingWork();
        return readAgentState('worksheet', this._agentSnapshot(), options);
      },

      /**
       * Beide Entpreller sofort ablegen: den 150-ms-`_persistAndNotify` einer
       * Datenänderung und den 2-s-`_autoSave` eines Renders (darin z. B. die
       * Auswahl). Die Agentenfläche ruft das nach jeder Aktion
       * (`ui/agent-host.js`, settle), damit nichts nach dem Vermerk der
       * Revision landet.
       * @noagent agent-host settle hook
       */
      flushPendingWork() {
        if (this._persistPending) {
          this._autoSave?.cancel?.();
          this._autoSavePending = false;
          this._persistNow();
        } else if (this._autoSavePending) {
          this._autoSave?.cancel?.();
          this._autoSavePending = false;
          this._persistStructural();
        }
      },

      /** Die Momentaufnahme, die `read()` projiziert. Kein Agentenaufruf. */
      _agentSnapshot() {
        // Erst das lebende Grid in das aktive Blatt spiegeln: die Zellen, die
        // der Nutzer gerade getippt hat, sind sonst noch nicht im Model, und
        // der Agent läse einen veralteten Stand. Genau derselbe Aufruf, den
        // jede strukturelle Operation des Moduls voranstellt.
        this._syncActiveSheet();
        const state = this._grid?.getState() ?? { columns: [], rowCount: 0 };
        const columns = (state.columns ?? []).map(c => ({
          id: c.id,
          name: c.name ?? '',
          shortName: c.shortName ?? '',
          type: c.type ?? 'numeric',
          unit: c.unit ?? null,
          role: c.role ?? null,
          // Dieselbe Quelle wie chart-suggestion `selection.columns[].roleConfirmed`:
          // das Handflag der Live-Spalte (Rollen-Dialog oder setColumnRole).
          roleConfirmed: c.roleManual === true,
          // Nur die Schlüssel, die die Oberfläche setzt; `getState()` spreizt
          // flach — ohne Kopie hielte der Agent das lebende Format-Objekt.
          format: Object.fromEntries(FORMAT_KEYS
            .filter(k => c.format?.[k] != null)
            .map(k => [k, c.format[k]])),
        }));
        const rows = [];
        for (let r = 0; r < (state.rowCount ?? 0); r++) {
          rows.push((state.columns ?? []).map(c => c.values?.[r] ?? null));
        }
        // Welche Zellen GERECHNET sind. Ohne dieses Feld konnte ein Agent
        // eine Formel zerstören, die er nicht sehen kann — `setCells`
        // löscht sie, wie der Zell-Editor.
        const formulas = [];
        for (const c of state.columns ?? []) {
          (c.formulas ?? []).forEach((formula, row) => {
            if (formula) formulas.push({ columnId: c.id, row, formula });
          });
        }
        return {
          sheets: (this.model.sheets ?? []).map(s => ({ id: s.id, name: s.name })),
          activeSheetId: this.model.activeSheetId ?? null,
          columns,
          rows,
          formulas,
          // Schwesterfelder der Umfangs-Deskriptoren. Sie stehen NICHT im
          // Feldschema und erscheinen deshalb nicht in `read()` —
          // `projectReadState` gibt nur erklärte Schlüssel aus. Nötig, weil
          // das globale `columns` ab dem zweiten tabellarischen Massenfeld
          // keinem Feld mehr eindeutig zugeordnet ist.
          rowsColumns: columns,
          formulasColumns: [{ name: 'columnId' }, { name: 'row' }, { name: 'formula' }],
        };
      },

      /**
       * Replace the active sheet's content with the given CSV data.
       * Same parse, undo and toast path as the file import.
       *
       * @agent
       * @param {string} csvText the full CSV/TSV text, header row included if present
       * @returns {{ columns: number, rows: number }} what was imported
       */
      importCsv(csvText) {
        const out = this._grid.importCSVText(String(csvText ?? ''), 'CSV');
        this._flushAndNotify();
        return out;
      },

      /**
       * Write a block of values into one column, starting at a row index.
       * Goes through the same `setCellValue` path as the cell editor and the
       * paste handler — type detection, locks and undo included.
       *
       * Values only, no formulas: this path goes straight to `setCellValue`,
       * so `"=C1*2"` lands here as plain text. Formulas are written with
       * `setFormula`.
       *
       * A plain value written into a formula cell OVERWRITES the formula —
       * `read().formulas` says which cells are computed; undo restores value
       * and formula.
       *
       * @agent
       * @param {string} columnId id of the target column (see read().columns[].id)
       * @param {number} startRow zero-based row index of the first value
       * @param {any[]} values the values to write, one per row; formulas are
       *   written as plain text, not evaluated
       * @returns {number} how many cells were actually written
       * @throws {Error} if no column has this id, or if the column is locked
       */
      setCells(columnId, startRow, values) {
        // `setCellValue` kehrt bei unbekannter Spalte und bei gesperrter
        // Spalte STILL zurück. Ohne diese Prüfung bekäme ein Agent, der sich
        // in der columnId vertippt, die Zahl seiner Eingabewerte als Erfolg
        // gemeldet — und baute seinen nächsten Schritt auf Daten, die es
        // nicht gibt.
        requireKnownId('columnId', columnId, (this._grid?.columns ?? []).map(c => c.id));
        const col = this._grid.getColumn(columnId);
        if (col.meta?.lock) {
          throw new Error(`column "${columnId}" is locked (${col.meta.lock})`);
        }
        const list = Array.isArray(values) ? values : [];
        const from = Number.isFinite(Number(startRow)) ? Math.max(0, Math.trunc(Number(startRow))) : 0;
        // Gezählt wird, was das Grid tatsächlich geschrieben hat, nicht, was
        // hineingereicht wurde: `cell:changed` feuert genau am Ende eines
        // erfolgreichen `setCellValue`.
        let written = 0;
        const count = () => { written += 1; };
        this._grid.on('cell:changed', count);
        try {
          for (let i = 0; i < list.length; i++) {
            const row = from + i;
            // Genau der Schritt, den der Zell-Editor vor dem Schreiben tut
            // (`datagrid.js` `_commitEdit`): ein einfacher Wert in eine
            // Formelzelle LÖSCHT die Formel. Ohne ihn schrieb `setCellValue`
            // den Wert, `cell:changed` zählte ihn — und das `render()`
            // unten rechnete ihn über `recalcAllFormulas` sofort wieder
            // weg. Der Agent bekam eine Zahl geschriebener Zellen für eine
            // Wirkung, die es nicht gab. Eine Absage wäre hier falsch: die
            // Oberfläche lässt den Nutzer eine Formel genauso überschreiben.
            // Genau der Schritt, den der Zell-Editor vor dem Schreiben tut —
            // jetzt über denselben öffentlichen Weg, der auch den
            // Historieneintrag um die gelöschte Formel ergänzt, sodass
            // `undo` beides zurückholt.
            this._grid.setCellValue(columnId, row, list[i], { clearFormula: true });
          }
        } finally {
          this._grid.off('cell:changed', count);
        }
        this._grid.render();
        this._flushAndNotify();
        return written;
      },

      /**
       * Write a formula into one cell of the active sheet, like the formula
       * editor: stored as text, evaluated at once, recorded for undo with
       * the formula that was there before. A row equal to the row count
       * extends the sheet by one row, like typing below the last row.
       *
       * An evaluation error (`#DIV/0`, `#REF!`, …) is not a rejected call:
       * the formula is stored, the cell value is `null`, and the error code
       * comes back — the UI shows the same cell with the same error.
       *
       * @agent
       * @param {string} columnId id of the target column (see read().columns[].id)
       * @param {number} row zero-based row index; the row count appends a row
       * @param {string} formula formula text starting with "=", e.g.
       *   "=C1[2]*2" (column 1, row 2, both 1-based)
       * @returns {{ value: any, error: string|null }} the computed cell value
       *   and the evaluation error code, `null` if none
       * @throws {Error} if no column has this id, the column is locked, row is
       *   not an integer in 0..row count, or formula does not start with "="
       */
      setFormula(columnId, row, formula) {
        // `setCellFormula` kehrt bei unbekannter Spalte und bei Sperre mit
        // `null` zurück — still für den Aufrufer. Dieselbe Vorabprüfung wie
        // `setCells`, damit beide Schreibwege dieselbe Sperre gleich melden.
        requireKnownId('columnId', columnId, (this._grid?.columns ?? []).map(c => c.id));
        const col = this._grid.getColumn(columnId);
        if (col.meta?.lock) {
          throw new Error(`column "${columnId}" is locked (${col.meta.lock})`);
        }
        requireIndex('row', row, this._grid?.rowCount ?? 0);
        // Nicht `requireText`: dessen Meldung verspricht `"" clears it`. Ein
        // Text ohne "=" ginge in `setCellFormula` still auf den Wertweg —
        // eine zweite Form von `setCells`, die der Agent nicht bestellt hat.
        if (!isFormula(formula)) {
          throw new Error(`invalid formula ${JSON.stringify(formula)}; allowed: a text starting with "="`);
        }
        const result = this._grid.setCellFormula(columnId, row, formula);
        this._grid.render();
        // `cell:changed` hat den Entpreller angestoßen; sofort ablegen, sonst
        // hielte die Laufzeit den nächsten Schreibzugriff für veraltet.
        this._persistNow();
        return result;
      },

      /**
       * Set the analytical role of a column on the active sheet, or confirm
       * the detected one by passing the same role — like the role dialog
       * before a chart suggestion. Afterwards read().columns[].roleConfirmed
       * is true, and chart suggestion reads the role as confirmed.
       *
       * Allowed roles depend on the column type: numeric/currency/percent →
       * continuous, categorical, ordinal, identifier; text → categorical,
       * ordinal, identifier, freeText; binary → categorical; date/time → date.
       * Role changes are not recorded in the undo history (as in the dialog).
       *
       * @agent
       * @param {string} columnId id of the column (see read().columns[].id)
       * @param {string} role one of continuous, categorical, ordinal, date,
       *   identifier, freeText — and valid for the column type
       * @returns {void}
       * @throws {Error} if no column has this id, if role is unknown or not
       *   valid for the column type, or if the column is locked
       */
      setColumnRole(columnId, role) {
        // `DataGrid.setColumnRole` kehrt bei unbekannter id, unbekannter
        // Rolle, unpassendem Typ und JEDER Sperre still zurück — der Agent
        // bekäme Erfolg gemeldet. Zweistufig geprüft: erst die volle
        // Rollenliste (Konstante), dann die für den Typ zulässige.
        requireKnownId('columnId', columnId, (this._grid?.columns ?? []).map(c => c.id));
        requireEnum('role', role, ALL_ROLES);
        const col = this._grid.getColumn(columnId);
        if (!isRoleValidForType(role, col.type)) {
          throw new Error(
            `invalid role ${JSON.stringify(role)} for column type ${JSON.stringify(col.type)}; `
            + `allowed: ${validRolesForType(col.type).join(', ')}`,
          );
        }
        if (col.meta?.lock) {
          throw new Error(`column "${columnId}" is locked (${col.meta.lock})`);
        }
        this._grid.setColumnRole(columnId, role);
        // `column:role-changed` steht nicht in `dataMutationEvents`: ohne
        // dieses Ablegen sähe chart-suggestion (liest `roleManual` aus dem
        // StateManager) die Bestätigung nie.
        this._persistNow();
      },

      /**
       * Move a row of the active sheet, like dragging its row header.
       * Undo moves it back.
       *
       * @agent
       * @param {number} fromRow zero-based index of the row to move
       * @param {number} toRow zero-based index the row has afterwards
       * @returns {boolean} false if fromRow equals toRow (nothing moved)
       * @throws {Error} if fromRow or toRow is not an existing row index
       */
      moveRow(fromRow, toRow) {
        // `DataGrid.moveRow` kehrt bei einem Index außerhalb STILL zurück.
        // Eine Sperre prüft das Ziehen nicht — hier also auch nicht.
        const rowCount = this._grid?.rowCount ?? 0;
        requireIndex('fromRow', fromRow, rowCount, { existing: true });
        requireIndex('toRow', toRow, rowCount, { existing: true });
        if (fromRow === toRow) return false;
        this._grid.moveRow(fromRow, toRow);
        this._persistNow();
        return true;
      },

      /**
       * Move a column of the active sheet, like dragging its header. Short
       * names (C1, C2 …) follow the new order. Undo moves it back.
       *
       * @agent
       * @param {string} columnId id of the column (see read().columns[].id)
       * @param {number} toIndex zero-based position the column has afterwards
       * @returns {boolean} false if the column already is at toIndex
       * @throws {Error} if no column has this id, or toIndex is not an
       *   existing column position
       */
      moveColumn(columnId, toIndex) {
        // `DataGrid.moveColumn` kehrt bei einem Index außerhalb STILL zurück.
        const ids = (this._grid?.columns ?? []).map(c => c.id);
        requireKnownId('columnId', columnId, ids);
        requireIndex('toIndex', toIndex, ids.length, { existing: true });
        const fromIndex = ids.indexOf(columnId);
        if (fromIndex === toIndex) return false;
        this._grid.moveColumn(fromIndex, toIndex);
        this._persistNow();
        return true;
      },

      /**
       * Change the type of a column on the active sheet, like the type picker
       * in the column header; the values are converted. A role the new type
       * does not allow is re-detected and loses its confirmation
       * (read().columns[].roleConfirmed becomes false). Currency and percent
       * bring 2 and 1 decimals. Not recorded in the undo history (as in the
       * picker).
       *
       * @agent
       * @param {string} columnId id of the column (see read().columns[].id)
       * @param {string} type one of numeric, text, date, time, currency,
       *   percent, binary
       * @returns {boolean} false if the column already has this type
       * @throws {Error} if no column has this id, type is unknown, or the
       *   column is locked
       */
      setColumnType(columnId, type) {
        // `DataGrid.setColumnType` kehrt bei unbekannter id, gleichem Typ und
        // JEDER Sperre still zurück; einen unbekannten Typ nähme es an.
        requireKnownId('columnId', columnId, (this._grid?.columns ?? []).map(c => c.id));
        requireEnum('type', type, Object.keys(COLUMN_TYPES));
        const col = this._grid.getColumn(columnId);
        if (col.meta?.lock) {
          throw new Error(`column "${columnId}" is locked (${col.meta.lock})`);
        }
        if (col.type === type) return false;
        this._grid.setColumnType(columnId, type);
        this._persistNow();
        return true;
      },

      /**
       * Set one display format key of a column on the active sheet, like the
       * format column of the type picker. numeric, currency, percent →
       * decimals (0..6); date → dateFormat; time → timeFormat; text and
       * binary have no format. null restores the type's default. Values are
       * unchanged — only the display. Not recorded in the undo history.
       *
       * @agent
       * @param {string} columnId id of the column (see read().columns[].id)
       * @param {'decimals'|'dateFormat'|'timeFormat'} key the format key; must
       *   fit the column type
       * @param {number|string|null} value decimals: whole number 0..6;
       *   dateFormat: dd.MM.yyyy, yyyy-MM-dd, dd/MM/yyyy, MM/dd/yyyy or
       *   d. MMMM yyyy; timeFormat: HH:mm or HH:mm:ss; null = default
       * @returns {void}
       * @throws {Error} if no column has this id, key is unknown or does not
       *   fit the column type, value is not allowed, or the column is locked
       */
      setColumnFormat(columnId, key, value) {
        // `DataGrid.setColumnFormat` übernimmt jeden Schlüssel und Wert
        // ungeprüft und kehrt bei Sperre still zurück. Zweistufig wie
        // `setColumnRole`: erst alle Schlüssel, dann die des Typs.
        requireKnownId('columnId', columnId, (this._grid?.columns ?? []).map(c => c.id));
        requireEnum('key', key, FORMAT_KEYS);
        const col = this._grid.getColumn(columnId);
        const keysForType = FORMAT_KEYS_BY_TYPE[col.type] ?? [];
        if (!keysForType.includes(key)) {
          const allowed = keysForType.length ? keysForType.join(', ') : 'none, this column type has no format';
          throw new Error(
            `invalid key ${JSON.stringify(key)} for column type ${JSON.stringify(col.type)}; allowed: ${allowed}`,
          );
        }
        let checked = null;
        if (value !== null) {
          if (key === 'decimals') checked = requireNumber('value', value, { min: 0, max: 6, integer: true });
          else {
            requireEnum('value', value, Object.keys(key === 'dateFormat' ? DATE_FORMATS : TIME_FORMATS));
            checked = value;
          }
        }
        if (col.meta?.lock) {
          throw new Error(`column "${columnId}" is locked (${col.meta.lock})`);
        }
        this._grid.setColumnFormat(columnId, { [key]: checked });
        // `column:format-changed` steht nicht in `dataMutationEvents`: ohne
        // dieses Ablegen ginge das Format beim nächsten Blattwechsel verloren.
        this._persistNow();
      },

      // ── Toast ────────────────────────────────────────────────
      _toast(msg, type) {
        if (module._context.notify) module._context.notify(msg, type);
        else _showToast(msg, type);
      },

      // ── Persistence / event emit (FROZEN contract) ───────────

      /** Write current state to the store + emit dataChanged (immediate). */
      _flushAndNotify() {
        const ctx = module._context;
        try {
          if (ctx?.stateManager && ctx?.instanceId) {
            this._syncActiveSheet();
            ctx.stateManager.setModuleState(ctx.instanceId, this.model.toJSON());
            ctx.eventBus?.emit('worksheet:dataChanged', { instanceId: ctx.instanceId });
          }
        } catch { /* ignore */ }
      },

      /**
       * Sofort ablegen statt über den 150-ms-Entpreller `_persistAndNotify`.
       * Die Agentenfläche vermerkt nach jeder Aktion die Revision dieser
       * Instanz (Lesen vor Schreiben, `core/agent/agent-revisions.js`);
       * landete die eigene Änderung erst danach, hielte die Laufzeit den
       * nächsten Schreibzugriff des Agenten für veraltet. Der noch laufende
       * Entpreller meldete dasselbe ein zweites Mal — er wird verworfen.
       */
      _persistNow() {
        this._persistAndNotify?.cancel?.();
        this._persistPending = false;
        this._flushAndNotify();
      },

      /**
       * Persist current workbook state WITHOUT emitting worksheet:dataChanged.
       * Used by structural ops that change which sheet is active but not the cell
       * data of any sheet (e.g. switchSheet). Replaces the safety-net the generic
       * persist-$watch used to provide (now opted out via config.manualPersist).
       * The auto-watch only persisted — it never emitted dataChanged — so this
       * preserves the exact (frozen) event surface for those paths.
       */
      _persistStructural() {
        const ctx = module._context;
        try {
          if (ctx?.stateManager && ctx?.instanceId) {
            this._syncActiveSheet();
            ctx.stateManager.setModuleState(ctx.instanceId, this.model.toJSON());
          }
        } catch { /* ignore */ }
      },

      // ── Suggest-Chart ────────────────────────────────────────

      _columnHasData(col) {
        if (!col || !Array.isArray(col.values)) return false;
        for (const v of col.values) if (v != null && v !== '') return true;
        return false;
      },
      _selectedColumnIndices() {
        if (!this._grid) return [];
        return this._grid.getSelectedColumnIndices();
      },
      /**
       * Columns the chart suggestion works on: the selection when there is
       * one, otherwise the only column holding data (if exactly one does).
       */
      _suggestColumnIndices() {
        const selected = this._selectedColumnIndices();
        if (selected.length > 0 || !this._grid) return selected;
        const withData = [];
        this._grid.columns.forEach((col, i) => { if (this._columnHasData(col)) withData.push(i); });
        return withData.length === 1 ? withData : [];
      },
      _canSuggestChart() {
        const indices = this._suggestColumnIndices();
        if (indices.length === 0) return false;
        return indices.every(i => this._columnHasData(this._grid.columns[i]));
      },
      _snapshotSelectedColumns() {
        const indices = this._suggestColumnIndices();
        const out = [];
        for (const idx of indices) {
          const col = this._grid.columns[idx];
          if (!col) continue;
          out.push({
            id: col.id,
            name: col.name || col.shortName || `C${idx + 1}`,
            role: col.role,
            type: col.type,
            values: Array.isArray(col.values) ? col.values.slice() : [],
          });
        }
        return out;
      },
      _findOwnPhase() {
        const stateManager = module._context.stateManager;
        const phases = stateManager.get('phases') || {};
        for (const phase of Object.keys(phases)) {
          if ((phases[phase] || []).some(i => i.instanceId === module._context.instanceId)) return phase;
        }
        return 'data';
      },
      _findOrCreateChartSuggestion(phase) {
        const stateManager = module._context.stateManager;
        const instances = stateManager.get(`phases.${phase}`) || [];
        const existing = instances.find(i => i.moduleId === 'chart-suggestion');
        if (existing) return { instanceId: existing.instanceId, created: false };
        const instanceId = uid();
        const updated = instances.slice();
        updated.push({ instanceId, moduleId: 'chart-suggestion', order: updated.length, state: {} });
        stateManager.set(`phases.${phase}`, updated);
        return { instanceId, created: true };
      },
      async _openChartSuggestion() {
        if (!this._canSuggestChart()) {
          this._toast(_t('suggestChartNoSelection'), 'error');
          return;
        }
        const proceed = await this._confirmAutoInferredRoles();
        if (!proceed) return;

        const columns = this._snapshotSelectedColumns();
        if (columns.length === 0) {
          this._toast(_t('suggestChartNoSelection'), 'error');
          return;
        }
        const phase = this._findOwnPhase();
        const { instanceId, created } = this._findOrCreateChartSuggestion(phase);
        const selection = {
          sourceInstanceId: module._context.instanceId,
          sourceSheetId: this.model.activeSheetId || null,
          ts: Date.now(),
          columns,
        };
        module._context.stateManager.setModuleState(instanceId, { selection, selectedChartType: null });
        module._context.eventBus.emit('chart-suggestion:load', { instanceId, selection });
        if (created) {
          module._context.eventBus.emit('module:added', { moduleId: 'chart-suggestion', phase, instanceId });
        } else {
          module._context.eventBus.emit('module:activated', { instanceId });
        }
      },

      _confirmAutoInferredRoles() {
        const indices = this._suggestColumnIndices() || [];
        const unconfirmed = indices
          .map(idx => this._grid.columns[idx])
          .filter(col => col && this._columnHasData(col) && col.roleManual !== true);
        if (unconfirmed.length === 0) return Promise.resolve(true);
        return this._openRoleConfirmPopout(unconfirmed);
      },

      /** Role confirmation before chart suggestions. Resolves true when confirmed. */
      async _openRoleConfirmPopout(columns) {
        const ctx = module._context;
        const label = (role) => ctx.i18n.t(`ui.datagrid.role${role.charAt(0).toUpperCase()}${role.slice(1)}`);
        this.roleDraft = columns.map((col) => {
          const valid = validRolesForType(col.type);
          return {
            colId: col.id,
            name: col.name || col.shortName || '?',
            type: col.type || '',
            // A role the type no longer allows shows as the first option, so
            // the draft starts there too: Confirm applies what the user saw.
            role: valid.includes(col.role) ? col.role : (valid[0] ?? col.role),
            options: valid.map((value) => ({ value, label: label(value) })),
          };
        });
        await this.$nextTick();
        const result = await ctx.dialog.form({
          title: _t('confirmRolesTitle'),
          content: this.$refs.roleConfirmForm,
          confirmLabel: _t('confirmRolesConfirm'),
          cancelLabel: ctx.i18n.t('common.cancel'),
          // Pull focus off the toolbar button behind the overlay: Enter would
          // click it again and open a second confirmation that borrows the form.
          onMount: (body, api) => {
            this._roleConfirmApi = api;
            this.$nextTick(() => body.closest('.dialog__window')?.querySelector('.dialog__confirm')?.focus());
          },
          onConfirm: () => {
            for (const { colId, role } of this.roleDraft) {
              try { this._grid.setColumnRole(colId, role); } catch { /* invalid role for type: keep */ }
            }
          },
        });
        this._roleConfirmApi = null;
        this.roleDraft = [];
        return result === true;
      },

      /** @noagent DOM event handler of the role-confirm dialog. Keeps the role-confirm draft in step with its select (options differ per row, so no x-model). */
      onRoleDraftChange(event, row) {
        row.role = event.target.value;
      },

      // ── Lifecycle ────────────────────────────────────────────

      /** @noagent per-instance lifecycle */
      init() {
        const container = module._container;
        const context = module._context;
        this._unsubs = [];

        const toast = (msg, type) => this._toast(msg, type);

        // Mount DataGrid into its anchor.
        const gridWrap = container.querySelector('[data-ref="grid-wrap"]');
        const dropzone = container.querySelector('[data-ref="dropzone"]');
        this._grid = new DataGrid(gridWrap, {
          toast, t: (k, v) => context.i18n.t(k, v), dialog: context.dialog,
        });
        if (context.eventBus) bridgeEmitter(this._grid, context.eventBus, 'datagrid');
        this._grid.setDropzone(dropzone);

        // Expose for the POM (window.__dmike.workspace.getActiveInstance()._grid).
        module._grid = this._grid;

        // FormulaEditor (imperative; its body waits in a hidden holder and is lent to the dialog service).
        const feHolder = container.querySelector('[data-ref="fe-holder"]');
        this._formulaEditor = new FormulaEditor(this._grid, feHolder, _t, toast, module._context.dialog);
        module._formulaEditor = this._formulaEditor;

        // Restore workbook into the grid; seed first sheet if empty.
        if (this.model.sheets.length === 0) {
          this.model.addSheet(_t('defaultSheetName'));
        }
        this._applyActiveSheetToGrid();

        // ── Debounced auto-save (render-driven) ──
        this._autoSave = debounce(() => {
          this._autoSavePending = false;
          try {
            if (context?.stateManager && context?.instanceId) {
              this._syncActiveSheet();
              context.stateManager.setModuleState(context.instanceId, this.model.toJSON());
            }
          } catch { /* ignore */ }
        }, 2000);

        // ── Fast persist + notify (data-mutation-driven, 150ms) ──
        this._persistAndNotify = debounce(() => {
          this._persistPending = false;
          try {
            if (context?.stateManager && context?.instanceId) {
              this._syncActiveSheet();
              context.stateManager.setModuleState(context.instanceId, this.model.toJSON());
              context.eventBus.emit('worksheet:dataChanged', { instanceId: context.instanceId });
            }
          } catch { /* ignore */ }
        }, 150);

        const dataMutationEvents = [
          'cell:changed', 'data:pasted', 'data:imported',
          'column:added', 'column:removed', 'column:renamed',
          'column:type-changed', 'column:moved',
          'rows:added', 'rows:removed', 'rows:moved',
          'undo', 'redo',
        ];
        const schedulePersist = () => {
          this._persistPending = true;
          this._persistAndNotify();
        };
        for (const evt of dataMutationEvents) this._grid.on(evt, schedulePersist);

        // ── Suggest-chart enable state ──
        const updateSuggest = () => { this.canSuggest = this._canSuggestChart(); };
        this._grid.on('selection:changed', updateSuggest);
        this._grid.on('render', updateSuggest);
        this._grid.on('cell:changed', updateSuggest);
        this._grid.on('data:pasted', updateSuggest);
        this._grid.on('data:imported', updateSuggest);
        this._grid.on('column:removed', updateSuggest);
        this._grid.on('rows:removed', updateSuggest);

        // ── Toolbar undo/redo state + status bar refresh on render ──
        const onRender = () => {
          this._autoSavePending = true;
          this._autoSave();
          this.canUndo = this._grid.history.canUndo();
          this.canRedo = this._grid.history.canRedo();
          // status* are computed getters bound via x-text; nudge Alpine.
          this.statusTick++;
        };
        this._grid.on('render', onRender);
        this._grid.on('selection:changed', () => { this.statusTick++; });

        // Initialize enable/disable + status text.
        this.canSuggest = this._canSuggestChart();
        this.canUndo = this._grid.history.canUndo();
        this.canRedo = this._grid.history.canRedo();

        // ── Persist initial state so column pickers see it ──
        try {
          const existing = context.stateManager.getModuleState(context.instanceId);
          if (!existing || !existing.sheets) {
            this._syncActiveSheet();
            context.stateManager.setModuleState(context.instanceId, this.model.toJSON());
          }
          context.eventBus.emit('worksheet:dataChanged', { instanceId: context.instanceId });
        } catch { /* ignore */ }

        // ── F4 shortcut for formula editor ──
        this._boundKeyDown = (e) => {
          if (!container.closest('.app-workspace')) return;
          if (shortcutRegistry.matches(e, 'worksheet.openFormulaEditor') && !this._formulaEditor.isOpen) {
            e.preventDefault();
            const sel = this._grid.selection;
            if (!sel) return;
            if (this._grid.editingCell && this._grid.editorEl) {
              const val = this._grid.editorEl.value;
              this._grid._cancelEdit();
              this._formulaEditor.open(sel.activeCol, sel.activeRow, val);
            } else {
              this._formulaEditor.open(sel.activeCol, sel.activeRow);
            }
          }
        };
        document.addEventListener('keydown', this._boundKeyDown, true);

        // ── Close export dropdown on outside click ──
        this._onDocClick = () => { this.exportOpen = false; };
        document.addEventListener('click', this._onDocClick);
        this._unsubs.push(() => document.removeEventListener('click', this._onDocClick));

        // ── External appendColumn requests ──
        this._onAppendColumn = (payload) => this._handleAppendColumn(payload);
        context.eventBus.on('worksheet:appendColumn', this._onAppendColumn);
        this._unsubs.push(() => context.eventBus.off('worksheet:appendColumn', this._onAppendColumn));

        // ── Formula-editor expand hint on "=" / formula edit start ──
        this._grid.on('edit:start', ({ colIdx, rowIdx, initialChar, formula }) => {
          if (initialChar === '=' || formula) {
            showFormulaExpandHint(this._grid, this._formulaEditor, colIdx, rowIdx);
          }
        });
      },

      /** @noagent per-instance lifecycle */
      destroy() {
        // Zuerst die Entpreller stilllegen. Beide schreiben über
        // setModuleState in den Projektzustand; ein noch laufender Timer
        // feuerte bis zu zwei Sekunden nach dem Teardown und legte den Stand
        // dieser Instanz erneut ab — nach dem Entfernen des Moduls als
        // verwaisten Datensatz, den kein Aufräumpfad je wieder anfasst.
        this._autoSave?.cancel?.();
        this._persistAndNotify?.cancel?.();
        this._roleConfirmApi?.cancel();
        if (this._boundKeyDown) document.removeEventListener('keydown', this._boundKeyDown, true);
        for (const unsub of this._unsubs) { try { unsub(); } catch { /* ignore */ } }
        this._unsubs = [];
        this._grid?.destroy();
        this._formulaEditor?.destroy();
        this._grid = null;
        this._formulaEditor = null;
        module._grid = null;
        module._formulaEditor = null;
      },

      // ── appendColumn handler (FROZEN behaviour) ──────────────
      // `reply` (optional) quittiert synchron, ob die Spalte geschrieben
      // wurde — `core/worksheet-append.js` schreibt sonst in den Store.
      _handleAppendColumn(payload) {
        const { instanceId, sheetId, colId, slot, name, values, discrete, type, reply } = payload;
        const context = module._context;
        if (instanceId !== context.instanceId) return;

        const colType = type === 'text' ? 'text' : 'numeric';
        const isText = colType === 'text';
        const format = isText ? {} : { decimals: discrete ? 0 : 6 };

        if (sheetId === this.model.activeSheetId) {
          let resolvedColId = colId;
          if (colId === '__first__') resolvedColId = this._grid.columns[0]?.id;
          else if (colId === '__slot__' && Number.isInteger(slot) && slot >= 0) resolvedColId = this._grid.columns[slot]?.id;
          const overwriteName = colId === '__first__' || colId === '__slot__';
          if (!resolvedColId || resolvedColId === '__new__') {
            const col = this._grid.addColumn({ name, type: colType, format });
            const needed = values.length - this._grid.rowCount;
            if (needed > 0) this._grid.addRows(needed);
            for (let i = 0; i < values.length; i++) col.values[i] = values[i];
          } else {
            const col = this._grid.columns.find(c => c.id === resolvedColId);
            if (!col) { reply?.({ ok: false, reason: 'unknown_column' }); return; }
            if (overwriteName && name) col.name = name;
            if (isText && col.type !== 'text') { col.type = 'text'; col.format = {}; }
            const needed = values.length - this._grid.rowCount;
            if (needed > 0) this._grid.addRows(needed);
            for (let i = 0; i < this._grid.rowCount; i++) {
              col.values[i] = i < values.length ? values[i] : null;
            }
          }
          this._grid.render();
        } else {
          // Inaktives Blatt: dieselbe Regel wie für einen nicht eingehängten
          // Worksheet (`applyAppendColumn`), hier auf dem Modell.
          this._syncActiveSheet();
          const res = applyAppendColumn(this.model.toJSON(), payload);
          if (!res.ok) { reply?.(res); return; }
          const sheet = this.model.sheets.find(s => s.id === sheetId);
          sheet.state = res.state.sheets.find(s => s.id === sheetId).state;
        }
        reply?.({ ok: true });

        try {
          this._syncActiveSheet();
          context.stateManager.setModuleState(instanceId, this.model.toJSON());
        } catch { /* ignore */ }
        context.eventBus.emit('worksheet:dataChanged', { instanceId });
      },
    };
  },
});

// ── getState/setState/loadExample overrides ────────────────────
// The generic createModule getState() reads the reactive model.toJSON(), but the
// live grid edits live in the DataGrid (not the model) until synced. We override
// to sync the active sheet (grid → model) before serializing, and to drive the
// grid on setState.

/** Find the live Alpine data-Fn for this instance (where _grid/_syncActiveSheet live). */
function liveData(self) {
  const root = self._container?.querySelector('[x-data]');
  if (!root) return null;
  try { return Alpine.$data(root); } catch { return null; }
}

// Legacy parity: the worksheet's onLanguageChange/onThemeChange were no-ops.
// The grid content is language-agnostic and the theme is handled by CSS custom
// properties. The generic Alpine onLanguageChange destroys + reinitialises the
// component tree, which would unmount the imperatively-mounted DataGrid and lose
// unsaved live-grid edits — so we keep it a no-op as in the legacy module.
mod.onLanguageChange = function onLanguageChange() {};
mod.onThemeChange = function onThemeChange() {};

mod.getState = function getState() {
  const d = liveData(this);
  if (d) {
    try { d._syncActiveSheet?.(); } catch { /* ignore */ }
    return d.model?.toJSON?.() ?? null;
  }
  return this._tmpl?._state?.toJSON?.() ?? null;
};

mod.setState = function setState(data) {
  const model = State.fromJSON(data);
  this._persist(model);
  const d = liveData(this);
  if (d) {
    // Mutate the existing reactive model IN PLACE so Alpine keeps tracking it
    // (reassigning d.model would drop the $watch binding) and the grid anchor
    // / _grid instance from init() stay mounted.
    if (d.model.sheets.length === 0 && model.sheets.length === 0) {
      model.addSheet(this._context.i18n.t('modules.worksheet.defaultSheetName'));
    }
    d.model.sheets = model.sheets;
    d.model.activeSheetId = model.activeSheetId;
    d.model.sheetCounter = model.sheetCounter;
    d._applyActiveSheetToGrid?.();
  } else if (this._tmpl) {
    this._tmpl._state = model;
  }
};

// A mounted worksheet keeps its data in the live DataGrid, so the generic
// applyRemoteState (which only patches the Alpine model) never reaches the grid,
// and the next autosave writes the stale grid back over the external change.
// Route remote/external state through setState, which drives the grid.
mod.applyRemoteState = function applyRemoteState(state) {
  if (state) this.setState(state);
};

mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const current = this.getState();
  const model = current ? State.fromJSON(current) : null;
  if (model && model.hasContent() && this._context?.dialog) {
    const ok = await this._context.dialog.confirm({ message: this._context.i18n.t('moduleHelp.confirmOverwrite'), danger: true });
    if (!ok) return;
  }
  if (!payload.data.sheets || !Array.isArray(payload.data.sheets) || payload.data.sheets.length === 0) {
    this._context?.notify?.(this._context.i18n.t('moduleHelp.exampleLoadError'), 'error');
    return;
  }
  try {
    this.setState(payload.data);
  } catch {
    this._context?.notify?.(this._context.i18n.t('moduleHelp.exampleLoadError'), 'error');
    return;
  }
  try {
    if (this._context?.stateManager && this._context?.instanceId) {
      this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
      this._context.eventBus?.emit('worksheet:dataChanged', { instanceId: this._context.instanceId });
    }
  } catch { /* ignore */ }
  // Scenario loads pass a pool + key (see provisionWorksheet in
  // examples-registry.js) so several examples backed by the SAME worksheet
  // file share one Datensammlung instead of piling up duplicates. A worksheet
  // ITSELF is a valid dedup target too — register this instance under its own
  // key so a later analysis item referencing the same file reuses it instead
  // of provisioning a second, out-of-sync copy. Absent outside scenario loads
  // (worksheetPool/worksheetKey are only ever passed by the scenario loader),
  // so normal example-load-button clicks are unaffected.
  const pool = this._context?.worksheetPool;
  const key = this._context?.worksheetKey;
  if (pool && key && this._context?.instanceId && !pool.has(key)) {
    const sheetId = payload.data.activeSheetId || payload.data.sheets[0]?.id;
    if (sheetId) pool.set(key, { instanceId: this._context.instanceId, sheetId });
  }
  const lang = this._context.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  this._context?.notify?.(this._context.i18n.t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

// ── Helpers ────────────────────────────────────────────────────

function _showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `datagrid-toast datagrid-toast--${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

/** Formula-expand hint (imperative; POM reads .fe-expand-hint). */
function showFormulaExpandHint(grid, fe, colIdx, rowIdx) {
  grid.container.querySelectorAll('.fe-expand-hint').forEach(el => el.remove());

  const rows = grid.bodyDiv.querySelectorAll('tbody tr');
  const td = rows[rowIdx]?.children[colIdx + 1];
  if (!td) return;

  const hint = document.createElement('button');
  hint.className = 'fe-expand-hint';
  hint.replaceChildren(icon('action.expand'));
  hint.title = 'Formula Editor (F4)';
  hint.style.cssText = `
    position:absolute; z-index:20;
    right:-1px; top:-1px;
    width:20px; height:20px;
    background:var(--color-accent); border:none; border-radius:0 0 0 4px;
    color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center;
    padding:0; font-size:10px;
    box-shadow: -2px 2px 6px rgba(0,0,0,.3);
  `;
  td.style.position = 'relative';
  td.appendChild(hint);

  hint.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const currentVal = grid.editorEl ? grid.editorEl.value : '=';
    grid._cancelEdit();
    hint.remove();
    fe.open(colIdx, rowIdx, currentVal);
  });

  const cleanup = () => {
    hint.remove();
    grid.container.removeEventListener('click', cleanup, true);
  };
  setTimeout(() => grid.container.addEventListener('click', cleanup, true), 50);
}

export default mod;
