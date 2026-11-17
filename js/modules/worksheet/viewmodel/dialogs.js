/**
 * D.Mike — Arbeitsblatt: Dialoge (viewmodel/dialogs.js)
 *
 * Teil des view-Blocks: der Formel-Editor (Funktionsleiste, Spaltenbezüge,
 * Textfeld mit Vorschau, Strg+Enter übernimmt) und das Kürzel F4. Der
 * Editor-Inhalt steht versteckt im Template und wird dem Dialogdienst
 * geliehen (`dialog.form`). Übernommen wird über das Model: ein Text mit „=“
 * über `setFormula`, sonst über `setCells` (Typerkennung wie die
 * Zelleingabe). F4 bei offener Zellbearbeitung bricht sie ab und übernimmt
 * ihren Text (`_datagrid.takeEditorText` des Rasters). Die Rollenbestätigung
 * vor dem Diagrammvorschlag steht in
 * `toolbar.js`; Typ, Rolle und Format einer Spalte wählt das Raster selbst
 * (Typ-Kürzel im Spaltenkopf).
 */
import { shortcutRegistry } from '../../../core/shortcut-registry.js';
import { isFormula, evaluateFormula } from '../../../core/datagrid/datagrid-formula.js';
import { formulaGrid } from '../../../core/datagrid/table/formulas.js';
import { activeSheetOf } from './sheets.js';

/**
 * Ein Eintrag der Funktionsleiste: Text zum Einfügen, Cursor-Versatz
 * (`-1`: vor der schließenden Klammer bzw. ans Ende), Länge der Markierung.
 * @typedef {{ insert: string, cursor: number, selectLen?: number }} Insert
 * @typedef {Insert & { id: string, label: string, kind: string, titleKey: string }} Chip
 * @typedef {{ id: string, label: string, kind: string, items: Array<Insert & { name: string, descKey: string }> }} MenuChip
 */

const fn = (name, kind, titleKey, insert = `${name}()`, cursor = -1, selectLen = 0, label = name) =>
  ({ id: name, label, kind, titleKey, insert, cursor, selectLen });
const item = (name, descKey, insert = `${name}()`, cursor = -1, selectLen = 0) =>
  ({ name, descKey, insert, cursor, selectLen });

/** Die Funktionsleiste, wie in der Altform. */
export const FORMULA_CHIPS = Object.freeze([
  fn('SUM', 'stat', 'fnSum'),
  fn('AVERAGE', 'stat', 'fnAvg', 'AVERAGE()', -1, 0, 'AVG'),
  { id: 'COUNT', label: 'COUNT', kind: 'stat', items: [
    item('COUNT', 'fnCount'), item('COUNTA', 'fnCounta'),
    item('COUNTIF', 'fnCountif', 'COUNTIF(col; > x)', 8, 3), item('SUMIF', 'fnSumif', 'SUMIF(col; > x)', 6, 3),
  ] },
  fn('MIN', 'stat', 'fnMin'),
  fn('MAX', 'stat', 'fnMax'),
  fn('STDEV', 'sigma', 'fnStdev'),
  fn('VAR', 'sigma', 'fnVar'),
  fn('MEDIAN', 'sigma', 'fnMedian'),
  fn('MODE', 'sigma', 'fnMode'),
  { id: 'QUANTILE', label: 'QUANTILE', kind: 'sigma', items: [
    item('PERCENTILE', 'fnPercentile', 'PERCENTILE(col; p)', 11, 3), item('QUARTILE', 'fnQuartile', 'QUARTILE(col; q)', 9, 3),
    item('IQR', 'fnIqr'), item('RANGE', 'fnRange'), item('SKEW', 'fnSkew'), item('KURT', 'fnKurt'),
  ] },
  { id: 'CPK', label: 'Cp/Cpk', kind: 'sigma', items: [
    item('CP', 'fnCp', 'CP(col; LSL; USL)', 3, 3), item('CPK', 'fnCpk', 'CPK(col; LSL; USL)', 4, 3),
    item('CPKUP', 'fnCpkUp', 'CPKUP(col; USL)', 6, 3), item('CPKLO', 'fnCpkLo', 'CPKLO(col; LSL)', 6, 3),
  ] },
  fn('IF', 'logic', 'fnIf', 'IF(cond; then; else)', 3, 4),
  fn('AND', 'logic', 'fnAnd', 'AND(a; b)', 4, 1),
  fn('OR', 'logic', 'fnOr', 'OR(a; b)', 3, 1),
  fn('NOT', 'logic', 'fnNot'),
  fn('ABS', 'math', 'fnAbs'),
  fn('MOD', 'math', 'fnMod', 'MOD(x; n)', 4, 1),
  fn('SIGN', 'math', 'fnSign'),
  fn('CONCAT', 'math', 'fnConcat', 'CONCAT(a; b)', 7, 1),
  { id: 'ROUND', label: 'ROUND', kind: 'math', items: [
    item('ROUND', 'fnRound', 'ROUND(x; n)', 6, 1), item('ROUNDUP', 'fnRoundUp', 'ROUNDUP(x; n)', 8, 1),
    item('ROUNDDOWN', 'fnRoundDown', 'ROUNDDOWN(x; n)', 10, 1),
  ] },
  fn('SQRT', 'math', 'fnSqrt', 'SQRT()', -1, 0, '√'),
  fn('POWER', 'math', 'fnPower', 'POWER(base; exp)', 6, 4, 'xⁿ'),
  fn('PI', 'math', 'fnPi', 'PI()', -1, 0, 'π'),
  { id: 'LOG', label: 'LOG', kind: 'math', items: [
    item('LN', 'fnLn'), item('LOG', 'fnLog', 'LOG(x; base)', 4, 1), item('EXP', 'fnExp'),
  ] },
  { id: 'SIN', label: 'SIN', kind: 'trig', items: [item('SIN', 'fnSin'), item('SIND', 'fnSind'), item('ASIN', 'fnAsin'), item('ASIND', 'fnAsind')] },
  { id: 'COS', label: 'COS', kind: 'trig', items: [item('COS', 'fnCos'), item('COSD', 'fnCosd'), item('ACOS', 'fnAcos'), item('ACOSD', 'fnAcosd')] },
  { id: 'TAN', label: 'TAN', kind: 'trig', items: [
    item('TAN', 'fnTan'), item('TAND', 'fnTand'), item('ATAN', 'fnAtan'), item('ATAND', 'fnAtand'),
    item('ATAN2', 'fnAtan2', 'ATAN2(y; x)', 6, 1),
  ] },
  fn('RAD', 'trig', 'fnRad'),
  fn('DEG', 'trig', 'fnDeg'),
]);

/**
 * Dialog-Teil des view-Blocks.
 * @param {any} ctx
 * @returns {Record<string, any>}
 */
export function dialogsView(ctx) {
  /** @type {((e: KeyboardEvent) => void)|null} */
  let onKey = null;
  /** Abbruch des offenen Formel-Dialogs. @type {{ cancel: () => void, confirm: () => void }|null} */
  let api = null;
  return {
    init() {
      // F4 öffnet den Formel-Editor an der aktiven Zelle (nur im sichtbaren Arbeitsbereich).
      // Eine offene Zellbearbeitung wird abgebrochen, ihr Text geht in den Editor (wie die Altform).
      onKey = (e) => {
        if (!this.$root.closest('.app-workspace')) return;
        if (!shortcutRegistry.matches(e, 'worksheet.openFormulaEditor') || this.state.formulaTarget) return;
        const grid = /** @type {any} */ (this.$root.querySelector('.worksheet__grid-host'))?._datagrid;
        // Die Auswahl meldet das Raster entprellt: vor dem Lesen jetzt melden lassen.
        grid?.flushView?.();
        const sel = this.activeView?.selection;
        if (!sel) return;
        e.preventDefault();
        const text = grid?.takeEditorText?.() ?? null;
        this.showFormulaEditor({}, text);
      };
      document.addEventListener('keydown', onKey, true);
    },
    destroy() {
      if (onKey) document.removeEventListener('keydown', onKey, true);
      onKey = null;
      api?.cancel();
      api = null;
    },

    /** Kurzinfo des Formelknopfs. */
    get formulaBtnTitle() { return `${this.t('formulaEditor')} (F4)`; },

    /** Die Funktionsleiste. */
    get formulaChips() { return FORMULA_CHIPS; },

    /**
     * Klasse eines Eintrags der Funktionsleiste.
     * @param {{ kind: string }} chip @returns {string}
     */
    chipClass(chip) { return `fn-chip--${chip.kind}`; },

    /** @param {{ items?: unknown }} chip @returns {boolean} Eintrag mit Menü? */
    hasMenu(chip) { return Array.isArray(chip.items); },

    /** @param {Chip} chip @returns {string} */
    chipTitle(chip) { return this.t(chip.titleKey); },

    /** @param {{ name: string, descKey: string }} entry @returns {string} */
    menuItemLabel(entry) { return `${entry.name} — ${this.t(entry.descKey)}`; },

    /** @param {{ id: string }} chip @returns {string} */
    chipGroupClass(chip) { return this.state.formulaMenu === chip.id ? 'fn-chip-group--open' : ''; },

    /** Lage des offenen Funktionsmenüs. */
    get formulaMenuStyle() { return `top:${this.state.formulaMenuTop}px;left:${this.state.formulaMenuLeft}px`; },

    /**
     * Funktionsmenü auf/zu, unter dem Eintrag.
     * @param {{ id: string }} chip @param {MouseEvent} event
     */
    toggleChipMenu(chip, event) {
      event.stopPropagation();
      if (this.state.formulaMenu === chip.id) { this.state.formulaMenu = null; return; }
      const r = /** @type {HTMLElement} */ (event.currentTarget).getBoundingClientRect();
      this.state.formulaMenuTop = r.bottom + 4;
      this.state.formulaMenuLeft = r.left;
      this.state.formulaMenu = chip.id;
    },

    /** Klick in den Editor schließt ein offenes Funktionsmenü. */
    closeChipMenu() { this.state.formulaMenu = null; },

    /** @param {Insert} entry @param {Event} [event] */
    insertChip(entry, event) {
      event?.stopPropagation();
      this.state.formulaMenu = null;
      this.insertFormulaText(entry.insert, entry.cursor, entry.selectLen ?? 0);
    },

    /** Spaltenbezüge für den Editor: Name in Anführungszeichen, sonst Kurzname. */
    get formulaColumns() {
      return activeSheetOf(this).columns.map((/** @type {any} */ c) => ({
        id: c.id, name: c.name, shortName: c.shortName, type: c.type,
        insert: c.name ? `'${c.name}'` : c.shortName,
      }));
    },

    /** @param {{ name: string, shortName: string }} col @returns {string} Name, sonst Kurzname */
    pillName(col) { return col.name || col.shortName; },

    /** Beispiel eines Spaltennamens in der Bezugsübersicht. */
    get refExampleCode() { return `'${this.t('feRefExampleName')}'`; },
    /** Beispiel einer Zelle über den Spaltennamen. */
    get refExampleCellCode() { return `'${this.t('feRefExampleName')}'[5]`; },
    /** Beispiel einer WENN-Formel. */
    get refIfExample() { return `IF(C1 > 10; "${this.t('feRefYes')}"; "${this.t('feRefNo')}")`; },
    /** „Abbrechen“ in der Tastenhilfe. */
    get cancelText() { return ctx.i18n.t('common.cancel'); },

    /** @param {{ insert: string, shortName: string, type: string }} col @returns {string} */
    columnPillTitle(col) { return `${this.t('feInsertAs')} ${col.insert}  (${col.shortName} · ${col.type})`; },

    /** @param {{ insert: string }} col */
    insertColumnRef(col) { this.insertFormulaText(col.insert, -1, 0); },

    /**
     * Text an der Schreibmarke einfügen.
     * @param {string} text @param {number} cursorBack @param {number} selectLen
     */
    insertFormulaText(text, cursorBack, selectLen) {
      const ta = /** @type {HTMLTextAreaElement|undefined} */ (this.$refs.formulaText);
      const cur = this.state.formulaText;
      const start = ta ? ta.selectionStart : cur.length;
      const end = ta ? ta.selectionEnd : cur.length;
      this.state.formulaText = cur.slice(0, start) + text + cur.slice(end);
      const pos = cursorBack !== -1 ? start + cursorBack : (text.endsWith(')') ? start + text.length - 1 : start + text.length);
      this.$nextTick(() => {
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(pos, selectLen > 0 ? pos + selectLen : pos);
      });
    },

    /** Vorschau des Entwurfs: `{ text, cls }` (leer, ok oder Fehler). */
    get formulaPreview() {
      void this.model.$tableRev;
      const raw = this.state.formulaText.trim();
      if (!raw || raw === '=') return { text: '—', cls: 'empty' };
      if (!isFormula(raw)) return { text: raw, cls: 'ok' };
      const sheet = activeSheetOf(this);
      const { result, error } = evaluateFormula(raw, formulaGrid(sheet.columns, sheet.data, sheet.formulas));
      if (error) return { text: error, cls: 'error' };
      return { text: result == null ? `(${this.t('feEmpty')})` : String(result), cls: 'ok' };
    },

    /** Klasse des Vorschauwerts. */
    get formulaPreviewClass() { return `formula-editor__preview-value ${this.formulaPreview.cls}`; },

    /** Klasse des Textfelds (Fehler markiert). */
    get formulaTextClass() { return this.formulaPreview.cls === 'error' ? 'formula-editor__textarea has-error' : 'formula-editor__textarea'; },

    /** Tasten im Textfeld: Strg+Enter übernimmt; Esc gehört dem Dialog. @param {KeyboardEvent} e */
    onFormulaKeydown(e) {
      if (shortcutRegistry.matches(e, 'worksheet.applyFormula')) { e.preventDefault(); api?.confirm(); }
      if (e.key !== 'Escape') e.stopPropagation();
    },

    /**
     * Rumpf des Viewmodel-Kommandos `openFormulaEditor`: die Zelle aus den
     * Argumenten (Raster: Doppelklick auf eine Formelzelle) oder die aktive
     * Zelle der Auswahl.
     * @param {{ sheetId?: string, columnId?: string, row?: number }} args
     * @param {string|null} [initialText] Starttext statt der Formel der Zelle (F4 bei offener Zellbearbeitung)
     * @throws {Error} ohne Zelle (übersetzte Meldung)
     */
    showFormulaEditor({ sheetId, columnId, row }, initialText = null) {
      if (this.state.formulaTarget) return;
      const sheet = sheetId
        ? this.model.sheets.find((/** @type {{ id: string }} */ s) => s.id === sheetId)
        : activeSheetOf(this);
      if (!sheet) throw new Error(`unknown_sheet: ${sheetId}`);
      let ci;
      let r;
      if (columnId !== undefined && row !== undefined) {
        ci = sheet.columns.findIndex((/** @type {{ id: string }} */ c) => c.id === columnId);
        r = row;
      } else {
        const sel = this.model.gridView[sheet.id]?.selection;
        if (sel) { ci = sel.activeCol; r = sel.activeRow; }
      }
      const col = ci === undefined ? undefined : sheet.columns[ci];
      if (!col || r === undefined) throw new Error(this.t('selectCellFirst'));
      const cellRef = `${col.shortName}[${r + 1}]`;
      const cellLabel = col.name && col.name !== col.shortName
        ? `${this.t('feCell')} ${cellRef} · ${col.name}` : `${this.t('feCell')} ${cellRef}`;
      this.state.formulaText = initialText ?? sheet.formulas[col.id]?.[String(r)] ?? '=';
      this.state.formulaTarget = { sheetId: sheet.id, columnId: col.id, row: r };
      void this.runFormulaDialog(`${this.t('formulaEditor')} — ${cellLabel}`);
    },

    /**
     * Den Editor-Inhalt im Dialog zeigen, bis Übernehmen oder Abbrechen.
     * @param {string} title @returns {Promise<void>}
     */
    async runFormulaDialog(title) {
      await this.$nextTick();
      try {
        await ctx.dialog.form({
          title,
          size: 'wide',
          content: this.$refs.formulaForm,
          confirmLabel: this.t('feApply'),
          cancelLabel: ctx.i18n.t('common.cancel'),
          onMount: (/** @type {HTMLElement} */ _body, /** @type {any} */ dialogApi) => {
            api = dialogApi;
            requestAnimationFrame(() => {
              const ta = /** @type {HTMLTextAreaElement|undefined} */ (this.$refs.formulaText);
              if (!ta) return;
              ta.focus();
              ta.setSelectionRange(ta.value.length, ta.value.length);
            });
          },
          onConfirm: () => this.applyFormula(),
        });
      } finally {
        api = null;
        this.state.formulaTarget = null;
        this.state.formulaMenu = null;
        /** @type {HTMLElement|null} */ (document.activeElement)?.blur?.();
      }
    },

    /**
     * Den Entwurf in die Zielzelle schreiben: mit „=“ als Formel, sonst als
     * Wert. Eine gesperrte Spalte schreibt nichts und schließt still (wie die
     * Altform); sonst abgelehnt bleibt der Dialog offen, mit übersetzter Meldung.
     * @returns {boolean} `false` hält den Dialog offen
     */
    applyFormula() {
      const target = this.state.formulaTarget;
      if (!target) return true;
      const text = this.state.formulaText.trim();
      const sheet = this.model.sheets.find((/** @type {{ id: string }} */ s) => s.id === target.sheetId);
      const col = sheet?.columns.find((/** @type {{ id: string }} */ c) => c.id === target.columnId);
      if (!col || col.meta?.lock) return true;
      try {
        if (isFormula(text)) {
          this.model.setFormula({ sheetId: target.sheetId, columnId: target.columnId, row: target.row, formula: text });
        } else {
          this.model.setCells({ sheetId: target.sheetId, columnId: target.columnId, startRow: target.row, values: [text === '' ? null : text] });
        }
      } catch (err) {
        console.warn('[worksheet] applyFormula', err);
        ctx.notify(this.t('formulaFailed'), 'error');
        return false;
      }
      ctx.notify(this.t('formulaApplied'), 'success');
      return true;
    },
  };
}
