/**
 * D.Mike — Makigami: Viewmodel.
 *
 * Inhalt, Kommandos, Invarianten, Kennzahlen und unlesbare Dauertexte liegen
 * im Model (domain/model.js); die Agentenfläche entsteht aus dessen Schema.
 * Texte binden `x-model`, der Faktor einer Zeiteinheit `x-field`, Anlegen,
 * Löschen, Mitwirkung, Verschwendung und das Klappen der Karten `x-command`,
 * Umsortieren die zwei Gesten reorder (interaction/reorder.js). Hier bleiben
 * die Anzeige (Nummern, Klassen, Namen, Kennzahltexte), der Umschalter der
 * Einstellungen in der Werkzeugleiste (rollt den Bereich in Sicht) und die
 * Normalform eines Dauertexts beim Verlassen des Feldes. Exporte: Schrittliste (CSV),
 * drei Blätter (XLSX), der JSON-Wert in der Form des Altexports und das Bild
 * der Matrix (SVG, PNG).
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { formatDuration } from '../domain/duration.js';
import { THEME_VAR, exportColors } from '../domain/theme.js';
import { stepReorder, roleReorder } from '../interaction/reorder.js';
import { fileNameBase, toLegacyJSON, stepRows, matrixRows, kpiRows } from '../io/export.js';
import { matrixSVG } from '../io/svg.js';
import { UiState } from './state.js';

/** @typedef {import('../domain/model.types.js').StateFields['steps'][number]} Step */
/** @typedef {import('../domain/model.types.js').StateFields['roles'][number]} Role */
/** @typedef {import('../domain/model.types.js').StateFields['mudaCategories'][number]} MudaCategory */
/** @typedef {'processTime'|'waitTime'} TimeField */

/** Spaltenköpfe der Schrittliste in Exportreihenfolge. */
const STEP_COLS = Object.freeze([
  'exportColStep', 'exportColActivity', 'exportColRoles', 'exportColProcess', 'exportColWait', 'exportColMuda', 'exportColNotes',
]);
/** Beschriftungen der Kennzahlen in Anzeigereihenfolge. */
const KPI_LABELS = Object.freeze(['kpiProcess', 'kpiWait', 'kpiLead', 'kpiPCE']);

/**
 * Der Name einer Verschwendungsart: eigener Name, sonst der mitgelieferte,
 * sonst das Kürzel.
 * @param {MudaCategory} cat @param {(key: string) => string} t @returns {string}
 */
function mudaName(cat, t) {
  return cat.label || (cat.labelKey ? t(cat.labelKey) : '') || cat.code || '';
}

/**
 * Die Texte der Exporte und des Bildes, übersetzt.
 * @param {any} vm Komponente (`this` der Mapper)
 */
function exportTexts(vm) {
  const t = /** @type {(key: string) => string} */ (vm.t);
  const m = vm.model;
  const kpi = vm.kpi && !('error' in vm.kpi) ? vm.kpi : { process: 0, wait: 0, lead: 0, pce: null };
  const noData = t('kpiNoData');
  const time = (/** @type {number} */ s) => (m.steps.length === 0 ? noData : formatDuration(s, m.timeUnits));
  return {
    rolePlaceholder: t('rolePlaceholder'),
    header: STEP_COLS.map((k) => t(k)),
    mudaLabel: (/** @type {MudaCategory} */ cat) => mudaName(cat, t),
    kpiLabels: KPI_LABELS.map((k) => t(k)),
    kpiValues: [
      time(kpi.process), time(kpi.wait), time(kpi.lead),
      kpi.pce == null ? noData : `${vm.num(kpi.pce * 100, 1)} %`,
    ],
  };
}

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  gestures: [stepReorder, roleReorder],
  config: {
    actions: [
      { icon: 'action.settings', title: 'settings', onClick: (/** @type {any} */ d) => d.toggleSettings(),
        dynamicText: (/** @type {any} */ d, /** @type {(k: string) => string} */ tf) => tf(d?.model?.settingsOpen ? 'settingsClose' : 'settingsOpen') },
    ],
  },
  /** @type {import('./state.types.js').MakigamiExports} */
  exports: {
    fileName() { return fileNameBase(this.model.title); },
    tree() { return toLegacyJSON(this.model); },
    table() {
      const x = exportTexts(this);
      return stepRows(this.model, x);
    },
    tables() {
      const x = exportTexts(this);
      return {
        [this.t('exportSheetMatrix')]: matrixRows(this.model, { rolePlaceholder: x.rolePlaceholder, mark: this.t('exportMark') }),
        [this.t('exportSheetSteps')]: stepRows(this.model, x),
        [this.t('exportSheetKPI')]: kpiRows(x.kpiLabels, x.kpiValues),
      };
    },
    image() {
      const x = exportTexts(this);
      return matrixSVG(this.model, {
        corner: `${this.t('rolesHeaderRows')} / ${this.t('rolesHeaderCols')}`,
        rolePlaceholder: x.rolePlaceholder,
        kpiLabels: x.kpiLabels,
        kpiValues: x.kpiValues,
      }, exportColors(this.cssVars(THEME_VAR)));
    },
  },
  /** @type {import('./state.types.js').MakigamiViewFn} */
  view(ctx) {
    return {
      // ─── Matrix ───────────────────────────────────────────
      /** Weder Rollen noch Schritte: Leerfläche statt Matrix. @returns {boolean} */
      get isEmpty() { return this.model.roles.length === 0 && this.model.steps.length === 0; },
      /** Spalten der Zeile „+ Rolle“: Rollenkopf, Schritte, Spalte „+ Schritt“. @returns {number} */
      get addRowSpan() { return this.model.steps.length + 2; },
      /** @param {number} i Position ab 0 @returns {string} „S1“ */
      stepBadge(i) { return `S${i + 1}`; },
      /** Titel einer Karte, ersatzweise ihre Nummer. @param {Step} step @param {number} i @returns {string} */
      cardTitle(step, i) { return step.title.trim() || this.stepBadge(i); },
      /**
       * DOM-id eines Feldes je Instanz und Schritt.
       * @param {string} name @param {string} stepId @returns {string}
       */
      fieldId(name, stepId) { return `mk-${name}-${ctx.instanceId}-${stepId}`; },

      /** @param {Step} step @param {Role} role @returns {boolean} */
      hasRole(step, role) { return step.roleIds.includes(role.id); },
      /** Wert für `participates` beim nächsten Klick. @param {Step} step @param {Role} role @returns {string} */
      nextParticipation(step, role) { return this.hasRole(step, role) ? 'false' : 'true'; },
      /** @param {Step} step @param {Role} role @returns {string} */
      roleClass(step, role) { return this.hasRole(step, role) ? 'makigami__dot--active' : ''; },
      /** @param {Step} step @param {Role} role @returns {string} */
      roleChipClass(step, role) { return this.hasRole(step, role) ? 'chip--active makigami__chip--active' : ''; },
      /** @param {Step} step @param {Role} role @returns {string} */
      rolePressed(step, role) { return this.hasRole(step, role) ? 'true' : 'false'; },
      /** Name einer Rolle, ersatzweise der Platzhalter. @param {Role} role @returns {string} */
      roleChipLabel(role) { return role.label.trim() || this.t('rolePlaceholder'); },

      /**
       * Klassen eines Schrittkopfs: gezogen bzw. Einfügemarke der Geste.
       * @param {Step} step @param {number} i @returns {string}
       */
      stepHeadClass(step, i) { return this.dropClass('steps', 'makigami__matrix-step-head', step.id, i); },
      /**
       * Klassen eines Rollenkopfs: gezogen bzw. Einfügemarke der Geste.
       * @param {Role} role @param {number} i @returns {string}
       */
      roleHeadClass(role, i) { return this.dropClass('roles', 'makigami__matrix-role-head', role.id, i); },
      /**
       * Vorschau der Geste: das gezogene Element blass, am Ziel eine Marke
       * an der Seite, an der es landet.
       * @param {'steps'|'roles'} group @param {string} base @param {string} id @param {number} i
       * @returns {string}
       */
      dropClass(group, base, id, i) {
        const p = this.state.dropPreview;
        if (!p || p.group !== group) return '';
        if (p.id === id) return `${base}--dragging`;
        if (p.index !== i) return '';
        const list = group === 'steps' ? this.model.steps : this.model.roles;
        const from = list.findIndex((x) => x.id === p.id);
        return from >= 0 && from < i ? `${base}--drag-over ${base}--drag-over-end` : `${base}--drag-over`;
      },

      // ─── Kennzahlen ───────────────────────────────────────
      /** @returns {{ process: number, wait: number, lead: number, pce: number|null }} */
      get kpiValues() {
        const k = this.kpi;
        return k && !('error' in k) ? k : { process: 0, wait: 0, lead: 0, pce: null };
      },
      /**
       * Eine Sekundenzahl als Dauertext, Bruchteile im Format der App-Sprache;
       * ohne Schritte ein Strich.
       * @param {'process'|'wait'|'lead'} key @returns {string}
       */
      kpiTime(key) {
        if (this.model.steps.length === 0) return this.t('kpiNoData');
        return formatDuration(this.kpiValues[key], this.model.timeUnits)
          .replace(/\d+\.\d+/g, (s) => this.num(Number(s)));
      },
      /** Die PCE mit einer Stelle und Einheit; ohne Lead Time ein Strich. @returns {string} */
      get kpiPce() {
        const pce = this.kpiValues.pce;
        return pce == null ? this.t('kpiNoData') : `${this.num(pce * 100, 1)} %`;
      },

      // ─── Karten ───────────────────────────────────────────
      /** @param {Step} step @returns {boolean} */
      cardExpanded(step) { return !this.model.collapsed.includes(step.id); },
      /** @param {Step} step @returns {string} */
      cardExpandedAttr(step) { return this.cardExpanded(step) ? 'true' : 'false'; },
      /** @param {Step} step @returns {string} */
      cardToggleLabel(step) { return this.t(this.cardExpanded(step) ? 'cardCollapse' : 'cardExpand'); },
      /**
       * Ist der Dauertext unlesbar (aus `invalidTimes`, nicht neu gelesen)?
       * @param {Step} step @param {TimeField} field @returns {boolean}
       */
      invalidTime(step, field) {
        const list = this.invalidTimes;
        return Array.isArray(list) && list.some((x) => x.stepId === step.id && x.field === field);
      },
      /** @param {Step} step @param {TimeField} field @returns {string} */
      timeClass(step, field) { return this.invalidTime(step, field) ? 'makigami__time-input--invalid' : ''; },
      /** @param {Step} step @param {TimeField} field @returns {string} */
      timeInvalidAttr(step, field) { return this.invalidTime(step, field) ? 'true' : 'false'; },
      /**
       * Feld verlassen: ein lesbarer Dauertext wird zur Normalform
       * („90min“ → „1h 30min“); sonst bleibt alles.
       * @param {string} stepId @param {TimeField} field
       */
      timeLeft(stepId, field) {
        if (!this.model.steps.some((s) => s.id === stepId)) return;
        this.model.normalizeStepTime({ stepId, field });
      },

      // ─── Verschwendung ────────────────────────────────────
      /** @param {MudaCategory} cat @returns {string} */
      mudaLabel(cat) { return mudaName(cat, this.t); },
      /** Platzhalter im Namensfeld: der mitgelieferte Name. @param {MudaCategory} cat @returns {string} */
      mudaPlaceholder(cat) { return cat.labelKey ? this.t(cat.labelKey) : ''; },
      /** @param {MudaCategory} cat @returns {string} */
      chipStyle(cat) { return `--chip-color:${cat.color}`; },
      /** @param {Step} step @param {MudaCategory} cat @returns {boolean} */
      hasMuda(step, cat) { return step.mudaIds.includes(cat.id); },
      /** Wert für `marked` beim nächsten Klick. @param {Step} step @param {MudaCategory} cat @returns {string} */
      nextMarked(step, cat) { return this.hasMuda(step, cat) ? 'false' : 'true'; },
      /** @param {Step} step @param {MudaCategory} cat @returns {string} */
      mudaChipClass(step, cat) { return this.hasMuda(step, cat) ? 'chip--active makigami__chip--active' : ''; },
      /** @param {Step} step @param {MudaCategory} cat @returns {string} */
      mudaPressed(step, cat) { return this.hasMuda(step, cat) ? 'true' : 'false'; },

      // ─── Einstellungen ────────────────────────────────────
      /** Nur noch eine Verschwendungsart: Löschen gesperrt. @returns {boolean} */
      get mudaLocked() { return this.model.mudaCategories.length <= 1; },
      /** Nur noch eine Zeiteinheit: Löschen gesperrt. @returns {boolean} */
      get unitLocked() { return this.model.timeUnits.length <= 1; },
      /** Hinweis am Löschknopf einer Art. @returns {string} */
      get mudaRemoveTitle() { return this.mudaLocked ? this.t('hints.lastMuda') : this.t('common.delete'); },
      /** Hinweis am Löschknopf einer Einheit. @returns {string} */
      get unitRemoveTitle() { return this.unitLocked ? this.t('hints.lastUnit') : this.t('common.delete'); },
      /**
       * Einstellungsbereich öffnen bzw. schließen (Ansichtsfeld `settingsOpen`);
       * geöffnet in Sicht rollen.
       */
      toggleSettings() {
        const open = !this.model.settingsOpen;
        this.model.setSettingsOpen({ open });
        if (!open) return;
        this.$nextTick(() => {
          this.$root?.querySelector('[data-ref="settings"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      },
    };
  },
});
