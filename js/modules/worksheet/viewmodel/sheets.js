/**
 * D.Mike — Arbeitsblatt: Reiter (viewmodel/sheets.js)
 *
 * Teil des view-Blocks: das aktive Blatt, die Reiterleiste mit
 * Inline-Umbenennen (Doppelklick, Enter übernimmt, Esc verwirft, Verlassen
 * übernimmt) und dem Kontextmenü der Reiter (Umbenennen, Duplizieren, Davor
 * einfügen, Löschen). Gewechselt wird über das Viewmodel-Kommando
 * `switchSheet`; Anlegen, Umbenennen, Kopieren, Einfügen und Löschen sind
 * Kommandos des Models, die übersetzten Vorgabenamen gibt dieser Teil mit.
 */
import { FALLBACK_SHEET_NAME } from '../domain/sheet.js';
import { WorksheetModel } from '../domain/model.js';
import { worksheetChanged } from './changed.js';

/** @param {any} vm @returns {any} das aktive Blatt (sonst das erste) */
export function activeSheetOf(vm) {
  const { sheets, activeSheetId } = vm.model;
  return sheets.find((/** @type {{ id: string }} */ s) => s.id === activeSheetId) ?? sheets[0];
}

/**
 * Reiter-Teil des view-Blocks.
 * @param {any} ctx
 * @returns {Record<string, any>}
 */
export function sheetsView(ctx) {
  /** @type {((e: Event) => void)|null} */
  let onDocDown = null;
  return {
    init() {
      const { stateManager } = ctx.context;
      const stored = stateManager.getModuleState(ctx.instanceId);
      const fresh = stored == null;
      const migrated = !fresh && stored._schema?.version !== WorksheetModel.schema.version;
      // Abgeschlossenes Projekt: nichts schreiben, auch nicht den Vorgabenamen.
      if (stateManager.isCompleted?.() !== true) {
        // Ein frisches Arbeitsblatt (noch nie gespeichert) heißt in der App-Sprache.
        const [only] = this.model.sheets;
        if (fresh && this.model.sheets.length === 1 && only.name === `${FALLBACK_SHEET_NAME} 1`) {
          const name = `${this.t('defaultSheetName')} 1`;
          if (name !== only.name) this.model.renameSheet({ id: only.id, name });
        }
        // Neuer oder migrierter Stand: sofort ablegen und melden, damit Spaltenwähler
        // und Leser anderer Module die Zielform sehen (wie die Altform beim Einhängen).
        if (fresh || migrated) {
          stateManager.setModuleState(ctx.instanceId, this.model.toJSON());
          worksheetChanged(null, { instanceId: ctx.instanceId, eventBus: ctx.eventBus });
        }
      }
      onDocDown = (e) => {
        if (!this.state.tabMenu) return;
        const target = /** @type {Element|null} */ (e.target instanceof Element ? e.target : null);
        if (!target?.closest('.worksheet__tab-menu')) this.state.tabMenu = null;
      };
      document.addEventListener('mousedown', onDocDown, true);
    },
    destroy() {
      if (onDocDown) document.removeEventListener('mousedown', onDocDown, true);
      onDocDown = null;
    },

    /** Das aktive Blatt. */
    get activeSheet() { return activeSheetOf(this); },

    /** Vorgabename eines neuen Blatts, z. B. „Tabelle 3“. */
    get nextSheetName() {
      return `${this.t('defaultSheetName')} ${this.model.sheetCounter + 1}`;
    },

    /**
     * Klasse eines Reiters.
     * @param {{ id: string }} sheet @returns {string}
     */
    tabClass(sheet) { return sheet.id === this.model.activeSheetId ? 'active' : ''; },

    /**
     * Wird dieser Reiter gerade umbenannt?
     * @param {{ id: string }} sheet @returns {boolean}
     */
    isRenaming(sheet) { return this.state.renamingSheetId === sheet.id; },

    /**
     * Inline-Umbenennen eines Reiters beginnen.
     * @param {string} id
     */
    startRename(id) {
      const sheet = this.model.sheets.find((/** @type {{ id: string }} */ s) => s.id === id);
      if (!sheet) return;
      this.state.renamingSheetId = id;
      this.state.renameDraft = sheet.name;
      this.$nextTick(() => {
        const input = /** @type {HTMLInputElement|null} */ (this.$root.querySelector('.sheet-tab__editor'));
        if (input) { input.focus(); input.select(); }
      });
    },

    /** Doppelklick in der Reiterleiste: den Reiter darunter umbenennen. @param {MouseEvent} event */
    onTabDblClick(event) {
      const tab = /** @type {HTMLElement|null} */ (/** @type {Element} */ (event.target).closest('.sheet-tab'));
      if (tab?.dataset.sheetId) this.startRename(tab.dataset.sheetId);
    },

    /**
     * Den Entwurf übernehmen. Ein leerer Entwurf ist ein Abbruch (der alte
     * Name bleibt); ein inzwischen gelöschtes Blatt ist nichts zu tun.
     */
    commitRename() {
      const id = this.state.renamingSheetId;
      if (id == null) return;
      const name = this.state.renameDraft;
      this.state.renamingSheetId = null;
      if (!this.model.sheets.some((/** @type {{ id: string }} */ s) => s.id === id)) return;
      if (String(name ?? '').trim() === '') return;
      try {
        this.model.renameSheet({ id, name });
      } catch (err) {
        console.warn('[worksheet] renameSheet', err);
      }
    },

    /** Tasten im Namensfeld: Enter übernimmt, Esc verwirft. @param {KeyboardEvent} event */
    onRenameKeydown(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        /** @type {HTMLElement} */ (event.target).blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.state.renamingSheetId = null;
      }
      event.stopPropagation();
    },

    /** Rechtsklick auf einen Reiter: das Kontextmenü an der Maus. @param {MouseEvent} event */
    onTabContextMenu(event) {
      const tab = /** @type {HTMLElement|null} */ (/** @type {Element} */ (event.target).closest('.sheet-tab'));
      if (!tab?.dataset.sheetId) return;
      event.preventDefault();
      this.state.tabMenu = { sheetId: tab.dataset.sheetId, x: event.clientX, y: event.clientY };
    },

    /** Lage des Kontextmenüs. */
    get tabMenuStyle() {
      const m = this.state.tabMenu;
      return m ? `left:${m.x}px;top:${m.y}px` : '';
    },

    /** Ist das Kontextmenü offen? */
    get tabMenuOpen() { return this.state.tabMenu !== null; },

    /** Menü: Umbenennen. */
    tabMenuRename() {
      const id = this.state.tabMenu?.sheetId;
      this.state.tabMenu = null;
      if (id) this.startRename(id);
    },

    /** Menü: Duplizieren („<Name> (Kopie)“). */
    tabMenuDuplicate() {
      const id = this.state.tabMenu?.sheetId;
      this.state.tabMenu = null;
      const src = this.model.sheets.find((/** @type {{ id: string }} */ s) => s.id === id);
      if (!src) return;
      this.runSheetCommand('duplicateSheet', { id, name: `${src.name} (${this.t('sheetCopy')})` });
    },

    /** Menü: leeres Blatt davor einfügen. */
    tabMenuInsertBefore() {
      const id = this.state.tabMenu?.sheetId;
      this.state.tabMenu = null;
      if (id) this.runSheetCommand('insertSheetBefore', { id, name: this.nextSheetName });
    },

    /** Menü: Löschen. Das letzte Blatt bleibt, mit Meldung. */
    tabMenuDelete() {
      const id = this.state.tabMenu?.sheetId;
      this.state.tabMenu = null;
      if (!id) return;
      if (this.model.sheets.length <= 1) {
        ctx.notify(this.t('lastSheetError'), 'error');
        return;
      }
      this.runSheetCommand('removeSheet', { id });
    },

    /**
     * Ein Blattkommando des Models aus dem Menü; ein Fehler wird übersetzt gemeldet.
     * @param {'duplicateSheet'|'insertSheetBefore'|'removeSheet'} name @param {object} args
     */
    runSheetCommand(name, args) {
      try {
        this.model[name](args);
      } catch (err) {
        console.warn(`[worksheet] ${name}`, err);
        ctx.notify(this.t('writeFailed'), 'error');
      }
    },
  };
}
