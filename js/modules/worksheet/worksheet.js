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
 */

import { createModule } from '../../core/template-module.js';
import Alpine from '@alpinejs/csp';
import { State } from './worksheet-model.js';
import { DataGrid, isFormula, evaluateFormula } from '../../core/datagrid/datagrid.js';
import { parseCellInput } from '../../core/datagrid/datagrid-utils.js';
import { validRolesForType } from '../../core/datagrid/datagrid-roles.js';
import { bridgeEmitter } from '../../core/tips/tip-engine.js';
import { shortcutRegistry } from '../../core/shortcut-registry.js';
import { h } from '../../core/dom.js';
import { icon } from '../../core/icon.js';
import { uid } from '../../core/uid.js';

// ═══════════════════════════════════════════════════════════
//  FORMULA EDITOR (imperative — bound to the live DataGrid)
//  Identical behaviour to the legacy editor; the only change is that
//  visibility is delegated to Alpine (feOpen flag) instead of toggling
//  overlay.style.display directly, so Alpine's x-show owns the display.
// ═══════════════════════════════════════════════════════════

class FormulaEditor {
  /**
   * @param {DataGrid} grid
   * @param {HTMLElement} overlayEl  the [data-ref="fe-overlay"] element
   * @param {HTMLElement} bodyAnchor the [data-ref="fe-body"] element to fill
   * @param {Function} t i18n helper (bare keys → modules.worksheet.*)
   * @param {Function} toast
   * @param {(open:boolean)=>void} onVisibility  toggles the Alpine feOpen flag
   */
  constructor(grid, overlayEl, bodyAnchor, t, toast, onVisibility) {
    this.grid = grid;
    this.overlay = overlayEl;
    this._t = t;
    this._toast = toast;
    this._onVisibility = onVisibility;
    this._targetCell = null;
    this._open = false;

    bodyAnchor.replaceChildren(this._buildHTML(t));

    this.textarea = overlayEl.querySelector('.formula-editor__textarea');
    this.previewVal = overlayEl.querySelector('.formula-editor__preview-value');
    this.cellLabel = overlayEl.querySelector('.formula-editor__cell-ref');
    this.colsBar = overlayEl.querySelector('.formula-editor__cols-bar');
    this.win = overlayEl.querySelector('.dmike-chart-popout');
    this.titlebar = overlayEl.querySelector('.dmike-chart-popout-titlebar');

    this._bindUI();
    this._initDrag();
  }

  get isOpen() { return this._open; }

  open(colIdx, rowIdx, initialFormula) {
    this.grid._cancelEdit();

    this._targetCell = { colIdx, rowIdx };
    this._open = true;

    const col = this.grid.columns[colIdx];
    const cellRef = `${col ? col.shortName : 'C?'}[${rowIdx + 1}]`;
    const hasCustomName = col && col.name && col.name !== col.shortName;

    this.cellLabel.textContent = hasCustomName
      ? `${this._t('feCell')} ${cellRef} · ${col.name}`
      : `${this._t('feCell')} ${cellRef}`;
    const existingFormula = col?.formulas?.[rowIdx];
    this.textarea.value = initialFormula != null
      ? initialFormula
      : (existingFormula || '=');

    this._renderColPills();

    this._onVisibility(true);
    requestAnimationFrame(() => {
      this.textarea.focus();
      const len = this.textarea.value.length;
      this.textarea.setSelectionRange(len, len);
      this._updatePreview();
    });
  }

  close() {
    this._open = false;
    this._targetCell = null;
    this._onVisibility(false);
    // Return focus to body so grid keyboard shortcuts work immediately
    document.activeElement?.blur();
  }

  _bindUI() {
    this.overlay.querySelector('.dmike-chart-popout-close').addEventListener('click', () => this.close());
    this.overlay.querySelector('[data-action="fe-cancel"]').addEventListener('click', () => this.close());
    this.overlay.querySelector('[data-action="fe-apply"]').addEventListener('click', () => this._apply());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.textarea.addEventListener('input', () => this._updatePreview());
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if (shortcutRegistry.matches(e, 'worksheet.applyFormula')) { e.preventDefault(); this._apply(); }
      e.stopPropagation();
    });

    // Simple chips (no dropdown)
    this.overlay.querySelectorAll('.fn-chip:not(.fn-chip--has-menu)').forEach(chip => {
      chip.addEventListener('click', () => {
        const insert = chip.dataset.insert || '';
        const cursorOffset = parseInt(chip.dataset.cursor ?? '-1');
        const selectLen = parseInt(chip.dataset.selectLen ?? '0');
        this._insertAtCursor(insert, cursorOffset, selectLen);
      });
    });

    const closeAllMenus = () => {
      this.overlay.querySelectorAll('.fn-chip-group--open').forEach(g => g.classList.remove('fn-chip-group--open'));
    };

    this.overlay.querySelectorAll('.fn-chip--has-menu').forEach(trigger => {
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

    this.overlay.querySelectorAll('.fn-chip-group__item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const insert = item.dataset.insert || '';
        const cursorOffset = parseInt(item.dataset.cursor ?? '-1');
        const selectLen = parseInt(item.dataset.selectLen ?? '0');
        closeAllMenus();
        this._insertAtCursor(insert, cursorOffset, selectLen);
      });
    });

    this.overlay.addEventListener('click', closeAllMenus);
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

  _apply() {
    if (!this._targetCell) { this.close(); return; }
    const { colIdx, rowIdx } = this._targetCell;
    const raw = this.textarea.value.trim();

    const col = this.grid.columns[colIdx];
    if (!col) { this.close(); return; }

    try {
      const oldFormula = col.formulas?.[rowIdx] || null;
      const oldValue = col.values[rowIdx];

      if (isFormula(raw)) {
        if (!col.formulas) col.formulas = new Array(this.grid.rowCount).fill(null);
        col.formulas[rowIdx] = raw;
        const { result, error } = evaluateFormula(raw, this.grid);
        col.values[rowIdx] = error ? null : result;
      } else if (raw !== '') {
        if (col.formulas) col.formulas[rowIdx] = null;
        col.values[rowIdx] = parseCellInput(col, raw);
      } else {
        if (col.formulas) col.formulas[rowIdx] = null;
        col.values[rowIdx] = null;
      }

      this.grid.history.push({
        type: 'cell-edit', columnId: col.id, rowIndex: rowIdx,
        oldValue, newValue: col.values[rowIdx],
        oldFormula, newFormula: col.formulas?.[rowIdx] || null,
      });
    } finally {
      this.close();
      this.grid.render();

      this.grid.setSelection({
        startCol: colIdx, startRow: rowIdx,
        endCol: colIdx, endRow: rowIdx,
        activeCol: colIdx, activeRow: rowIdx,
      });
    }

    this._toast(this._t('formulaApplied'), 'success');
  }

  _initDrag() {
    if (!this.titlebar || !this.win) return;
    let dx = 0, dy = 0, dragging = false;

    this._onDragStart = (e) => {
      if (e.target.closest('.dmike-chart-popout-close')) return;
      dragging = true;
      const rect = this.win.getBoundingClientRect();
      dx = e.clientX - rect.left;
      dy = e.clientY - rect.top;
      this.win.style.left = `${rect.left  }px`;
      this.win.style.top = `${rect.top  }px`;
      e.preventDefault();
    };
    this._onDragMove = (e) => {
      if (!dragging) return;
      this.win.style.left = `${e.clientX - dx  }px`;
      this.win.style.top = `${e.clientY - dy  }px`;
    };
    this._onDragEnd = () => { dragging = false; };

    this.titlebar.addEventListener('mousedown', this._onDragStart);
    window.addEventListener('mousemove', this._onDragMove);
    window.addEventListener('mouseup', this._onDragEnd);
  }

  destroy() {
    if (this._onDragMove) window.removeEventListener('mousemove', this._onDragMove);
    if (this._onDragEnd)  window.removeEventListener('mouseup',   this._onDragEnd);
  }

  /**
   * Build the formula-editor body (injected into the overlay shell).
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

    return h('div', { class: 'dmike-chart-popout dmike-chart-popout--formula-editor' },
      h('div', { class: 'dmike-chart-popout-titlebar' },
        h('span', null,
          h('span', { class: 'formula-editor__icon' }, 'ƒ'),
          ` ${t('formulaEditor')} `,
          h('span', { class: 'formula-editor__cell-ref' }, `${t('feCell')} —`)),
        h('button', { class: 'dmike-chart-popout-close', title: `${t('close')} (Esc)` },
          icon('action.close'))),
      h('div', { class: 'dmike-chart-popout-body dmike-popout-body--column' },
        fnBar,
        h('div', { class: 'formula-editor__cols-bar' },
          h('div', { class: 'formula-editor__cols-label' }, t('feColumnRefs'))),
        body),
      h('div', { class: 'dmike-popout-footer' },
        h('button', { class: 'btn', 'data-action': 'fe-cancel' }, t('cancel')),
        h('button', { class: 'btn btn--primary', 'data-action': 'fe-apply' },
          icon('action.confirm', { cls: 'worksheet__fe-check' }), ` ${t('feApply')}`)),
    );
  }
}

// ═══════════════════════════════════════════════════════════
//  MODULE
// ═══════════════════════════════════════════════════════════

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
      _unsubs: [],
      _boundKeyDown: null,
      _onDocClick: null,
      _onAppendColumn: null,
      _autoSave: null,
      _persistAndNotify: null,
      canUndo: false,
      canRedo: false,
      canSuggest: false,
      exportOpen: false,
      feOpen: false,
      renamingId: null,
      renameValue: '',
      // Reactive nonce — bumped on grid render/selection so the status-bar
      // x-text expressions (which read the non-reactive _grid) re-evaluate.
      statusTick: 0,

      // ── i18n / view helpers ──────────────────────────────────
      formulaBtnTitle: () => `${_t('formulaEditor')} (F4)`,
      suggestBtnTitle() {
        return this.canSuggest ? _t('suggestChartTitle') : _t('suggestChartNoSelection');
      },
      refExampleCode: () => `'${_t('feRefExampleName')}'`,
      refIfExample: () => `IF(C1 > 10; "${_t('feRefYes')}"; "${_t('feRefNo')}")`,

      statusDims() {
        void this.statusTick; // reactive dependency
        if (!this._grid) return '';
        return _t('statusDims', { cols: this._grid.columns.length, rows: this._grid.rowCount });
      },
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
      undo() { this._grid?.undo(); },
      redo() { this._grid?.redo(); },
      addColumn() { this._grid?.addColumn(); },
      addRows() { this._grid?.addRows(10); },
      deleteSelection() { this._grid?._clearSelection(); },

      toggleExport(event) { event?.stopPropagation(); this.exportOpen = !this.exportOpen; },
      exportAs(fmt) {
        this.exportOpen = false;
        if (fmt === 'xlsx') this._grid?.downloadXLSX();
        else if (fmt === 'csv') this._grid?.downloadCSV();
        else if (fmt === 'json') this._grid?.downloadJSON();
      },

      triggerImport() {
        module._container.querySelector('[data-ref="file-input"]')?.click();
      },
      onFileChange(event) {
        const file = event.target.files[0];
        if (file) this._grid?._handleFileImport(file);
        event.target.value = '';
      },

      openFormulaEditor() {
        const sel = this._grid?.selection;
        if (!sel) { this._toast(_t('selectCellFirst'), 'error'); return; }
        this._formulaEditor.open(sel.activeCol, sel.activeRow);
      },
      closeFormulaEditor() { this._formulaEditor?.close(); },
      cancelFormula() { this._formulaEditor?.close(); },
      applyFormula() { this._formulaEditor?._apply(); },

      suggestChart() { this._openChartSuggestion(); },

      // ── Sheet tab handlers ───────────────────────────────────
      addSheet() {
        this._syncActiveSheet();
        // Numbered default name, e.g. "Sheet 2" — counter is bumped inside addSheet,
        // so the new sheet's number is the next counter value.
        this.model.addSheet(`${_t('defaultSheetName')} ${this.model.sheetCounter + 1}`);
        this._applyActiveSheetToGrid();
        this._flushAndNotify();
      },
      switchSheet(id) {
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
      commitRename() {
        if (this.renamingId == null) return;
        this.model.renameSheet(this.renamingId, this.renameValue);
        this.renamingId = null;
        this._flushAndNotify();
      },
      onRenameKeydown(event) {
        if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
        else if (event.key === 'Escape') {
          event.preventDefault();
          this.renamingId = null; // discard
        }
        event.stopPropagation();
      },

      onTabContextMenu(event) {
        const tab = event.target.closest('.sheet-tab');
        if (!tab) return;
        event.preventDefault();
        const sheetId = tab.dataset.sheetId;
        this._grid._showContextMenu(event.clientX, event.clientY, [
          { label: _t('renameSheet'), action: () => this._startRename(sheetId) },
          { label: _t('duplicateSheet'), action: () => this._duplicateSheet(sheetId) },
          { type: 'sep' },
          { label: _t('insertSheetBefore'), action: () => this._insertSheetBefore(sheetId) },
          { type: 'sep' },
          { label: _t('deleteSheet'), danger: true, action: () => this._deleteSheet(sheetId) },
        ]);
      },

      _duplicateSheet(id) {
        this._syncActiveSheet();
        this.model.duplicateSheet(id, _t('sheetCopy'));
        this._applyActiveSheetToGrid();
        this._flushAndNotify();
      },
      _insertSheetBefore(id) {
        this._syncActiveSheet();
        this.model.insertSheetBefore(id, `${_t('defaultSheetName')  } ${  this.model.sheetCounter + 1}`);
        this._applyActiveSheetToGrid();
        this._flushAndNotify();
      },
      _deleteSheet(id) {
        const ok = this.model.removeSheet(id);
        if (!ok) { this._toast(_t('lastSheetError'), 'error'); return; }
        this._applyActiveSheetToGrid();
        this._flushAndNotify();
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
      _canSuggestChart() {
        const indices = this._selectedColumnIndices();
        if (indices.length === 0) return false;
        return indices.every(i => this._columnHasData(this._grid.columns[i]));
      },
      _snapshotSelectedColumns() {
        const indices = this._selectedColumnIndices();
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
        const instanceId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `cs-${  Date.now().toString(36)  }-${  Math.random().toString(36).slice(2, 8)}`;
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
        const indices = this._selectedColumnIndices() || [];
        const unconfirmed = indices
          .map(idx => this._grid.columns[idx])
          .filter(col => col && this._columnHasData(col) && col.roleManual !== true);
        if (unconfirmed.length === 0) return Promise.resolve(true);
        return this._openRoleConfirmPopout(unconfirmed);
      },

      /** Imperative role-confirmation popout (POM reads this exact markup). */
      _openRoleConfirmPopout(columns) {
        const t = _t;
        const ctx = module._context;
        return new Promise((resolve) => {
          const overlay = document.createElement('div');
          overlay.className = 'dmike-chart-popout-overlay';

          const win = document.createElement('div');
          win.className = 'dmike-chart-popout dmike-chart-popout--compact worksheet-role-confirm';
          win.style.width = '480px';
          win.style.height = 'auto';
          win.style.maxHeight = '80vh';
          win.style.left = 'calc(50% - 240px)';
          win.style.top = '120px';

          const titleBar = document.createElement('div');
          titleBar.className = 'dmike-chart-popout-titlebar';
          const titleText = document.createElement('span');
          titleText.textContent = t('confirmRolesTitle');
          const closeBtn = document.createElement('button');
          closeBtn.className = 'dmike-chart-popout-close';
          closeBtn.replaceChildren(icon('action.close'));
          titleBar.append(titleText, closeBtn);

          const body = document.createElement('div');
          body.className = 'dmike-chart-popout-body dmike-popout-body--column';

          const message = document.createElement('div');
          message.className = 'dmike-popout-message';
          message.textContent = t('confirmRolesIntro');
          body.appendChild(message);

          const list = document.createElement('div');
          list.className = 'worksheet-role-confirm__list';
          const roleLabels = {
            continuous: ctx.i18n.t('ui.datagrid.roleContinuous'),
            categorical: ctx.i18n.t('ui.datagrid.roleCategorical'),
            ordinal: ctx.i18n.t('ui.datagrid.roleOrdinal'),
            date: ctx.i18n.t('ui.datagrid.roleDate'),
            identifier: ctx.i18n.t('ui.datagrid.roleIdentifier'),
            freeText: ctx.i18n.t('ui.datagrid.roleFreeText'),
          };
          const rowSelects = [];
          for (const col of columns) {
            const row = document.createElement('div');
            row.className = 'worksheet-role-confirm__row';

            const nameEl = document.createElement('div');
            nameEl.className = 'worksheet-role-confirm__name';
            nameEl.textContent = col.name || col.shortName || '?';
            row.appendChild(nameEl);

            const typeEl = document.createElement('div');
            typeEl.className = 'worksheet-role-confirm__type';
            typeEl.textContent = col.type || '';
            row.appendChild(typeEl);

            const select = document.createElement('select');
            select.className = 'worksheet-role-confirm__select';
            const valid = validRolesForType(col.type);
            for (const role of valid) {
              const opt = document.createElement('option');
              opt.value = role;
              opt.textContent = roleLabels[role] || role;
              if (role === col.role) opt.selected = true;
              select.appendChild(opt);
            }
            row.appendChild(select);
            list.appendChild(row);
            rowSelects.push({ colId: col.id, select });
          }
          body.appendChild(list);

          const footer = document.createElement('div');
          footer.className = 'dmike-popout-footer';
          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'btn btn--secondary';
          cancelBtn.textContent = ctx.i18n.t('common.cancel');
          const confirmBtn = document.createElement('button');
          confirmBtn.className = 'btn btn--primary';
          confirmBtn.textContent = t('confirmRolesConfirm');
          footer.append(cancelBtn, confirmBtn);
          body.appendChild(footer);

          win.append(titleBar, body);
          overlay.appendChild(win);
          document.body.appendChild(overlay);

          const close = (result) => {
            window.removeEventListener('keydown', onKey);
            overlay.remove();
            resolve(result);
          };
          const onKey = (e) => { if (e.key === 'Escape') close(false); };
          window.addEventListener('keydown', onKey);
          closeBtn.addEventListener('click', () => close(false));
          cancelBtn.addEventListener('click', () => close(false));
          overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
          confirmBtn.addEventListener('click', () => {
            for (const { colId, select } of rowSelects) {
              try { this._grid.setColumnRole(colId, select.value); } catch { /* ignore */ }
            }
            close(true);
          });

          setTimeout(() => confirmBtn.focus(), 0);
        });
      },

      // ── Lifecycle ────────────────────────────────────────────

      init() {
        const container = module._container;
        const context = module._context;
        this._unsubs = [];

        const toast = (msg, type) => this._toast(msg, type);

        // Mount DataGrid into its anchor.
        const gridWrap = container.querySelector('[data-ref="grid-wrap"]');
        const dropzone = container.querySelector('[data-ref="dropzone"]');
        this._grid = new DataGrid(gridWrap, { toast, t: (k, v) => context.i18n.t(k, v) });
        if (context.eventBus) bridgeEmitter(this._grid, context.eventBus, 'datagrid');
        this._grid.setDropzone(dropzone);

        // Expose for the POM (window.__dmike.workspace.getActiveInstance()._grid).
        module._grid = this._grid;

        // FormulaEditor (imperative; body injected into the overlay shell anchor).
        const feOverlay = container.querySelector('[data-ref="fe-overlay"]');
        const feBody = container.querySelector('[data-ref="fe-body"]');
        this._formulaEditor = new FormulaEditor(
          this._grid, feOverlay, feBody, _t, toast,
          (open) => { this.feOpen = open; },
        );
        module._formulaEditor = this._formulaEditor;

        // Restore workbook into the grid; seed first sheet if empty.
        if (this.model.sheets.length === 0) {
          this.model.addSheet(_t('defaultSheetName'));
        }
        this._applyActiveSheetToGrid();

        // ── Debounced auto-save (render-driven) ──
        this._autoSave = debounce(() => {
          try {
            if (context?.stateManager && context?.instanceId) {
              this._syncActiveSheet();
              context.stateManager.setModuleState(context.instanceId, this.model.toJSON());
            }
          } catch { /* ignore */ }
        }, 2000);

        // ── Fast persist + notify (data-mutation-driven, 150ms) ──
        this._persistAndNotify = debounce(() => {
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
        for (const evt of dataMutationEvents) this._grid.on(evt, this._persistAndNotify);

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

      destroy() {
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
      _handleAppendColumn({ instanceId, sheetId, colId, slot, name, values, discrete, type }) {
        const context = module._context;
        if (instanceId !== context.instanceId) return;

        const colType = type === 'text' ? 'text' : 'numeric';
        const isText = colType === 'text';
        const format = isText ? {} : { decimals: discrete ? 0 : 6 };

        const isActiveSheet = sheetId === this.model.activeSheetId;
        const isFirstSlot = colId === '__first__';
        const isSlotIndex = colId === '__slot__' && Number.isInteger(slot) && slot >= 0;
        let resolvedColId = colId;
        if (isFirstSlot) {
          if (isActiveSheet) {
            resolvedColId = this._grid.columns[0]?.id;
          } else {
            const sh = this.model.sheets.find(s => s.id === sheetId);
            resolvedColId = sh?.state?.columns?.[0]?.id;
          }
        } else if (isSlotIndex) {
          if (isActiveSheet) {
            resolvedColId = this._grid.columns[slot]?.id;
          } else {
            const sh = this.model.sheets.find(s => s.id === sheetId);
            resolvedColId = sh?.state?.columns?.[slot]?.id;
          }
        }
        const overwriteName = isFirstSlot || isSlotIndex;
        const isNewCol = !resolvedColId || resolvedColId === '__new__';

        if (isActiveSheet) {
          if (isNewCol) {
            const col = this._grid.addColumn({ name, type: colType, format });
            const needed = values.length - this._grid.rowCount;
            if (needed > 0) this._grid.addRows(needed);
            for (let i = 0; i < values.length; i++) col.values[i] = values[i];
          } else {
            const col = this._grid.columns.find(c => c.id === resolvedColId);
            if (!col) return;
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
          this._syncActiveSheet();
          const sheet = this.model.sheets.find(s => s.id === sheetId);
          if (!sheet) return;
          if (!sheet.state) sheet.state = { columns: [], rowCount: 0, colWidths: {}, sortCol: null, sortDir: null, selection: null };
          const cols = sheet.state.columns || [];

          if (isNewCol) {
            const nextIdx = cols.length + 1;
            cols.push({
              id: uid(),
              name,
              shortName: `C${  nextIdx}`,
              type: colType,
              unit: '',
              values,
              formulas: new Array(values.length).fill(null),
              format,
            });
            sheet.state.columns = cols;
          } else {
            const col = cols.find(c => c.id === resolvedColId);
            if (!col) return;
            if (overwriteName && name) col.name = name;
            if (isText) { col.type = 'text'; col.format = {}; }
            col.values = values;
            col.formulas = new Array(values.length).fill(null);
          }
          sheet.state.rowCount = Math.max(sheet.state.rowCount || 0, values.length);
        }

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

mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const current = this.getState();
  const model = current ? State.fromJSON(current) : null;
  if (model && model.hasContent() && this._context?.confirmPopout) {
    const ok = await this._context.confirmPopout(this._context.i18n.t('moduleHelp.confirmOverwrite'), { danger: true });
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

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

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
