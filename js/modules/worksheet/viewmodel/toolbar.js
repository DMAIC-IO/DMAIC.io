/**
 * D.Mike — Arbeitsblatt: Werkzeugleiste, Raster und Statuszeile (viewmodel/toolbar.js)
 *
 * Teil des view-Blocks: Konfiguration des Widgets `datagrid` für das aktive
 * Blatt (nur lesend im abgeschlossenen Projekt), Rückgängig/Wiederholen über
 * den Verlauf des Kerns (`ctx.history`, Kommandos `undo`/`redo`),
 * Auswahl leeren, Exportmenü, Datei-Eingabe (Auswahl und Ablegen), die
 * Statuszeile und der Diagrammvorschlag (öffnet `chart-suggestion` in der
 * eigenen Phase, wie die Altform). Die Auswahl des Rasters steht als
 * Ansichtszustand in `model.gridView[<Blatt-id>]`.
 */
import { validRolesForType } from '../../../core/datagrid/datagrid-roles.js';
import { importKind, readImportText } from '../io/import.js';
import { openOrActivateInstance } from '../../../core/instance-handoff.js';
import { activeSheetOf } from './sheets.js';

/** Rollen des Rasters → Kommandos (Model; `gridView`, `openFormulaEditor`, `exportAs`: Viewmodel). */
const GRID_COMMANDS = Object.freeze({
  setCells: 'setCells', setFormula: 'setFormula', pasteBlock: 'pasteBlock', fillRange: 'fillRange',
  moveCells: 'moveCells', clearRange: 'clearRange', addColumn: 'addColumn', removeColumn: 'removeColumn',
  moveColumn: 'moveColumn',
  renameColumn: 'renameColumn', addRows: 'addRows', removeRows: 'removeRows', moveRow: 'moveRow',
  sortRows: 'sortRows', setColumnType: 'setColumnType', setColumnFormat: 'setColumnFormat',
  setColumnRole: 'setColumnRole', gridView: 'gridView', openFormulaEditor: 'openFormulaEditor',
  exportAs: 'exportAs',
});

/** Alle Merkmale des Rasters an, Formelzellen öffnen den Formel-Editor des Moduls. */
const GRID_FEATURES = Object.freeze({
  formulas: true, roles: true, structure: true, sort: true, fill: true, clipboard: true,
  stats: true, scan: true, formulaEditor: true,
});

/** @param {any[]|undefined} values @returns {boolean} hat die Spalte einen Wert? */
function hasData(values) {
  if (!Array.isArray(values)) return false;
  for (const v of values) if (v != null && v !== '') return true;
  return false;
}

/**
 * Die gewählten Spalten (Bereich und Strg+Klick), aufsteigend.
 * @param {any} selection @param {number} count Spaltenzahl
 * @returns {number[]}
 */
export function selectedColumns(selection, count) {
  const set = new Set();
  if (selection) {
    const a = Math.min(selection.startCol, selection.endCol);
    const b = Math.max(selection.startCol, selection.endCol);
    for (let i = a; i <= b; i++) if (i >= 0 && i < count) set.add(i);
    for (const i of selection.extraCols ?? []) if (i >= 0 && i < count) set.add(i);
  }
  return [...set].sort((x, y) => x - y);
}

/**
 * Die Spalten für den Diagrammvorschlag: die Auswahl, sonst die einzige Spalte
 * mit Werten (wenn genau eine Werte hat).
 * @param {any} sheet @param {any} selection
 * @returns {number[]}
 */
export function suggestColumns(sheet, selection) {
  const picked = selectedColumns(selection, sheet.columns.length);
  if (picked.length > 0) return picked;
  const withData = [];
  sheet.data.columns.forEach((/** @type {any[]} */ col, /** @type {number} */ i) => { if (hasData(col)) withData.push(i); });
  return withData.length === 1 ? withData : [];
}

/**
 * Werkzeugleisten-Teil des view-Blocks.
 * @param {any} ctx
 * @returns {Record<string, any>}
 */
export function toolbarView(ctx) {
  /** @type {(() => void)|null} */
  let onDocClick = null;
  /** Die offene Rollenbestätigung (Dialogdienst), zum Abbrechen beim Abbau. @type {{ cancel: () => void }|null} */
  let roleApi = null;
  /** @type {(() => void)|null} */
  let onStatus = null;
  return {
    init() {
      onDocClick = () => { if (this.state.exportOpen) this.state.exportOpen = false; };
      document.addEventListener('click', onDocClick);
      const sm = ctx.context.stateManager;
      this.state.projectCompleted = sm.isCompleted?.() === true;
      onStatus = () => { this.state.projectCompleted = sm.isCompleted?.() === true; };
      ctx.context.eventBus?.on?.('project:status-changed', onStatus);
    },
    destroy() {
      if (onDocClick) document.removeEventListener('click', onDocClick);
      onDocClick = null;
      if (onStatus) ctx.context.eventBus?.off?.('project:status-changed', onStatus);
      onStatus = null;
      roleApi?.cancel();
      roleApi = null;
    },

    /** Gespeicherte Ansicht des aktiven Blatts (Spaltenbreiten, Auswahl) oder `null`. */
    get activeView() { return this.model.gridView[activeSheetOf(this).id] ?? null; },

    /**
     * @noagent Das Raster meldet seine Auswahl entprellt (300 ms): eine Aktion,
     * die sie liest (Löschen, Formel-Editor, Diagrammvorschlag), lässt sie
     * vorher sofort melden — sonst träfe sie die zuletzt gemeldete, alte Auswahl.
     */
    flushGridView() {
      /** @type {any} */ (this.$root?.querySelector('.worksheet__grid-host'))?._datagrid?.flushView?.();
    },

    /**
     * @noagent Vor einem Agentenstapel (agent-host `settle`): eine offene
     * Zellbearbeitung als eigenen Schritt übernehmen, wie Enter, und die
     * Ansicht melden — sonst verwürfe der Stapel die Eingabe (Zeilen
     * verschoben) oder sie überschriebe danach seinen Wert.
     */
    flushPendingWork() {
      const grid = /** @type {any} */ (this.$root?.querySelector('.worksheet__grid-host'))?._datagrid;
      grid?.commitEdit?.();
      grid?.flushView?.();
    },

    /** Konfiguration des Rasters für das aktive Blatt. */
    get gridConfig() {
      const sheet = activeSheetOf(this);
      const view = this.model.gridView[sheet.id];
      return {
        // Abgeschlossenes Projekt: nur lesen (die Altform fragte das Raster, `_isReadOnly`);
        // reaktiv über `project:status-changed`, ohne Neuladen.
        readOnly: this.state.projectCompleted,
        features: GRID_FEATURES,
        commands: GRID_COMMANDS,
        commandArgs: { sheetId: sheet.id },
        view: { colWidths: view?.colWidths ?? {}, selection: view?.selection ?? null },
      };
    },

    // ─── Verlauf (Kern) ──────────────────────────────────────
    /** @noagent Kann zurückgenommen werden? Sperrt den Knopf. */
    get canUndo() { return ctx.history?.can('undo') ?? false; },
    /** @noagent Kann wiederholt werden? Sperrt den Knopf. */
    get canRedo() { return ctx.history?.can('redo') ?? false; },
    /**
     * @noagent Rumpf der Viewmodel-Kommandos `undo`/`redo` (die Agenten rufen
     * diese): ein Schritt im Verlauf des Kerns.
     * @param {'undo'|'redo'} dir
     * @returns {boolean} `false` bei leerem Verlauf oder abgeschlossenem Projekt
     */
    stepHistory(dir) { return ctx.history?.step(dir) ?? false; },

    // ─── Auswahl, Export, Datei ──────────────────────────────
    /** Die Auswahl des Rasters leeren (Kommando `clearRange`); ohne Auswahl nichts. */
    deleteSelection() {
      this.flushGridView();
      const sel = this.activeView?.selection;
      if (!sel) return;
      const sheetId = activeSheetOf(this).id;
      try {
        this.model.clearRange({
          sheetId,
          c0: Math.min(sel.startCol, sel.endCol), r0: Math.min(sel.startRow, sel.endRow),
          c1: Math.max(sel.startCol, sel.endCol), r1: Math.max(sel.startRow, sel.endRow),
        });
      } catch (err) {
        ctx.notify(err instanceof Error ? err.message : String(err), 'error');
      }
    },

    /** Exportmenü auf/zu. @param {Event} event */
    toggleExport(event) {
      event?.stopPropagation();
      this.state.exportOpen = !this.state.exportOpen;
    },

    /** Klasse des Exportmenüs. */
    get exportMenuClass() { return this.state.exportOpen ? 'open' : ''; },

    /** `aria-expanded` des Exportknopfs. */
    get exportExpanded() { return this.state.exportOpen ? 'true' : 'false'; },

    /**
     * Gewählte oder abgelegte Datei: CSV/TSV ersetzt den Inhalt des aktiven
     * Blatts (Kommando `importCsv`), andere Endungen melden sich ab.
     * @param {File} file
     * @returns {Promise<void>}
     */
    async importFile(file) {
      const { kind, ext } = importKind(file?.name);
      if (kind !== 'csv') {
        ctx.notify(this.t('importUnsupported', { ext }), 'error');
        return;
      }
      const sheetId = activeSheetOf(this).id;
      let out;
      try {
        out = this.model.importCsv({ sheetId, csvText: await readImportText(file) });
      } catch (err) {
        console.warn('[worksheet] importCsv', err);
        ctx.notify(this.t('importFailed'), 'error');
        return;
      }
      ctx.notify(this.t('importDone', { name: file.name, cols: out.columns, rows: out.rows }), 'success');
    },

    // ─── Statuszeile ─────────────────────────────────────────
    /** „5 Spalten × 100 Zeilen“ des aktiven Blatts. */
    get statusDims() {
      void this.model.$tableRev;
      const sheet = activeSheetOf(this);
      return this.t('statusDims', { cols: sheet.columns.length, rows: sheet.data.rowCount });
    },

    /**
     * @noagent Ereignis `datagrid-selection` des Rasters: die gezeigte Auswahl
     * für die Statuszeile (R19 c), ohne auf `gridView` zu warten.
     * @param {CustomEvent} event
     */
    onGridSelection(event) {
      const s = event?.detail?.selection ?? null;
      this.state.liveSelectionSheetId = activeSheetOf(this).id;
      this.state.liveSelection = s ? {
        startCol: s.startCol, startRow: s.startRow, endCol: s.endCol, endRow: s.endRow,
        activeCol: s.activeCol, activeRow: s.activeRow,
      } : null;
    },

    /** Auswahl: „3×2 ausgewählt“ oder die aktive Zelle „C1[4]“. */
    get statusSelection() {
      const live = this.state.liveSelectionSheetId === activeSheetOf(this).id;
      const sel = live ? this.state.liveSelection : this.activeView?.selection;
      if (!sel) return '';
      const rows = Math.abs(sel.endRow - sel.startRow) + 1;
      const cols = Math.abs(sel.endCol - sel.startCol) + 1;
      if (rows * cols > 1) return this.t('statusSelection', { rows, cols });
      return `${activeSheetOf(this).columns[sel.activeCol]?.shortName || '?'}[${sel.activeRow + 1}]`;
    },

    // ─── Diagrammvorschlag ───────────────────────────────────
    /** Lässt sich ein Diagramm vorschlagen (Spalten gewählt, alle mit Werten)? */
    get canSuggest() {
      void this.model.$tableRev;
      const sheet = activeSheetOf(this);
      const idx = suggestColumns(sheet, this.activeView?.selection);
      return idx.length > 0 && idx.every((i) => hasData(sheet.data.columns[i]));
    },

    /** Kurzinfo des Vorschlagknopfs. */
    get suggestTitle() { return this.canSuggest ? this.t('suggestChartTitle') : this.t('suggestChartNoSelection'); },

    /**
     * Rumpf des Viewmodel-Kommandos `suggestChart`: erst die Rollen der
     * Spalten bestätigen lassen, die noch nicht bestätigt sind, dann
     * `chart-suggestion` öffnen.
     * @throws {Error} ohne passende Spalten (übersetzte Meldung)
     */
    startChartSuggestion() {
      this.flushGridView();
      if (!this.canSuggest) throw new Error(this.t('suggestChartNoSelection'));
      const sheet = activeSheetOf(this);
      const idx = suggestColumns(sheet, this.activeView?.selection);
      const unconfirmed = idx.filter((i) => sheet.columns[i].roleManual !== true);
      if (unconfirmed.length === 0) { this.openChartSuggestion(sheet.id, idx); return; }
      void this.confirmRolesThen(sheet, unconfirmed, () => this.openChartSuggestion(sheet.id, idx));
    },

    /**
     * Die Rollenbestätigung zeigen; bestätigt: Rollen setzen (ein Schritt),
     * dann `next`.
     * @param {any} sheet @param {number[]} indices @param {() => void} next
     * @returns {Promise<void>}
     */
    async confirmRolesThen(sheet, indices, next) {
      const label = (/** @type {string} */ role) => ctx.i18n.t(`ui.datagrid.role${role.charAt(0).toUpperCase()}${role.slice(1)}`);
      this.state.roleDraft = indices.map((i) => {
        const col = sheet.columns[i];
        const valid = validRolesForType(col.type);
        return {
          columnId: col.id,
          name: col.name || col.shortName || '?',
          type: col.type || '',
          // Eine Rolle, die der Typ nicht mehr erlaubt, steht als erste Option da.
          role: valid.includes(col.role) ? col.role : (valid[0] ?? col.role),
          options: valid.map((value) => ({ value, label: label(value) })),
        };
      });
      await this.$nextTick();
      // Die Bestätigung ist Inhalt des Moduls (`$refs`, ausgeliehen an
      // dialog.form), kein eigener createDialog: `roleApi` ist die API, die
      // dialog.form selbst über onMount reicht — `destroy` bricht damit ab.
      // Zurückgesetzt wird in `finally`, wie `_api` in createDialog.
      let ok;
      try {
        ok = await ctx.dialog.form({
          title: this.t('confirmRolesTitle'),
          content: this.$refs.roleConfirmForm,
          confirmLabel: this.t('confirmRolesConfirm'),
          cancelLabel: ctx.i18n.t('common.cancel'),
          onMount: (/** @type {HTMLElement} */ body, /** @type {any} */ dialogApi) => {
            roleApi = dialogApi ?? null;
            this.$nextTick(() => /** @type {HTMLElement|null} */ (body.closest('.dialog__window')?.querySelector('.dialog__confirm'))?.focus());
          },
          onConfirm: () => {
            this.confirmRoles({ sheetId: sheet.id, roles: this.state.roleDraft.map((r) => ({ columnId: r.columnId, role: r.role })) });
          },
        });
      } finally {
        roleApi = null;
      }
      this.state.roleDraft = [];
      if (ok === true) next();
    },

    /**
     * Auswahl einer Rolle in der Bestätigung.
     * @param {Event} event @param {{ role: string }} row
     */
    onRoleDraftChange(event, row) {
      row.role = /** @type {HTMLSelectElement} */ (event.target).value;
    },

    /**
     * `chart-suggestion` in der eigenen Phase öffnen (vorhandene Instanz oder
     * neue) und die Spalten übergeben, wie die Altform.
     * @param {string} sheetId @param {number[]} indices
     */
    openChartSuggestion(sheetId, indices) {
      const sheet = this.model.sheets.find((/** @type {{ id: string }} */ s) => s.id === sheetId);
      if (!sheet) return;
      const columns = indices.map((i) => {
        const col = sheet.columns[i];
        return {
          id: col.id, name: col.name || col.shortName || `C${i + 1}`, role: col.role, type: col.type,
          values: (sheet.data.columns[i] ?? []).slice(),
        };
      });
      const selection = { sourceInstanceId: ctx.instanceId, sourceSheetId: sheetId, ts: Date.now(), columns };
      openOrActivateInstance(this._ui.services, {
        moduleId: 'chart-suggestion',
        state: { selection, selectedChartType: null },
        loadEvent: { name: 'chart-suggestion:load', detail: { selection } },
      });
    },
  };
}
