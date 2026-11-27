/**
 * D.Mike — Deployment-Flowchart: Viewmodel.
 *
 * Schritte, Bahnen und Kommandos liegen im Model (domain/model.js); die
 * Agentenfläche entsteht aus dessen Schema. Einfügen, Löschen, Bahnen und
 * die Unterschritte lösen ihre Kommandos im Template aus (`x-command`,
 * `x-field`), das Verschieben die Gesten (interaction/gestures.js).
 * Exporte: Mapper nach Datenform, Menü und Dateien baut der Kern.
 * Hier bleiben: Beschriftung der Bahnen, Lücken und Schienen der Kette, die
 * Vorschau der Gesten, das Hineinscrollen neuer Karten, der Fokus nach
 * „Rolle hinzufügen“ und der Importdialog über den Instanzendienst.
 * Die Höhe der Textfelder regelt CSS (`field-sizing: content`).
 */
import { createModule } from '../../../core/template-module.js';
import { substepsView } from '../../../core/flowchart/substeps-view.js';
import descriptor from '../module.js';
import { State, UNASSIGNED_ID } from '../domain/model.js';
import { IMPORT_SOURCES, seedsFromRead } from '../domain/import.js';
import { chain, substeps } from '../interaction/gestures.js';
import { toJsonTree } from '../io/export.js';
import { UiState } from './state.js';

/** Platz neben einer neuen Karte beim Hineinscrollen (Verbinder davor, Lücke danach). */
const REVEAL_PAD = 48;

/**
 * Den Canvas so weit scrollen, dass die Karte eines neuen Schritts sichtbar
 * ist; die nächste Kante gewinnt, eine sichtbare Karte bewegt nichts.
 * @param {HTMLElement} root @param {string} id
 */
function revealStep(root, id) {
  const canvas = root.querySelector('.df__canvas');
  const col = canvas?.querySelector(`.df__col[data-step-id="${CSS.escape(id)}"]`);
  if (!canvas || !col) return;
  const c = canvas.getBoundingClientRect();
  const r = col.getBoundingClientRect();
  if (r.left < c.left + REVEAL_PAD) canvas.scrollLeft += r.left - c.left - REVEAL_PAD;
  else if (r.right > c.right - REVEAL_PAD) canvas.scrollLeft += r.right - c.right + REVEAL_PAD;
}

/**
 * Auswahlzeilen des Importdialogs: Titel der Instanz; ohne Titel bei
 * mehreren Instanzen derselben Quelle die Ordnungszahl, sonst leer.
 * @param {Array<{ instanceId: string, moduleId: string, title: string }>} infos
 * @returns {Array<{ instanceId: string, moduleId: 'process-map'|'sipoc', label: string }>}
 */
function importOptionsOf(infos) {
  return IMPORT_SOURCES.flatMap((src) => {
    const own = infos.filter((x) => x.moduleId === src);
    return own.map((x, i) => ({
      instanceId: x.instanceId,
      moduleId: /** @type {'process-map'|'sipoc'} */ (src),
      label: x.title || (own.length > 1 ? `#${i + 1}` : ''),
    }));
  });
}

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  gestures: [chain, substeps],
  config: {
    actions: [
      { icon: 'action.add', title: 'addStep', variant: 'primary', command: 'addStep', args: {} },
      { icon: 'action.add', title: 'addLane', onClick: (d) => d.addLaneAndFocus() },
      { icon: 'action.upload', title: 'importFrom', onClick: (d) => d.openImport() },
    ],
  },
  view: [substepsView, /** @type {import('./state.types.js').DeploymentFlowchartViewFn} */ ((ctx) => ({
    init() {
      // Eine neue Karte (Werkzeugleiste, Verbinder, Agent, Wiederholen) ins Bild holen.
      let known = new Set(this.model.steps.map((s) => s.id));
      this.$watch(() => this.model.steps.map((s) => s.id).join('\n'), () => {
        const ids = this.model.steps.map((s) => s.id);
        const added = ids.find((id) => !known.has(id));
        known = new Set(ids);
        if (added) this.$nextTick(() => revealStep(this.$root, added));
      });
    },

    /** DOM-id je Instanz. @param {string} name @returns {string} */
    fieldId(name) { return `df-${name}-${ctx.instanceId}`; },

    // ─── Bahnen ────────────────────────────────────────
    /** @param {{ id: string }} lane @returns {boolean} die reservierte Bahn „Nicht zugeordnet“ */
    isUnassigned(lane) { return lane?.id === UNASSIGNED_ID; },
    /**
     * Beschriftung einer Bahn: die reservierte aus der Oberflächensprache,
     * unbenannte mit Platzhalter.
     * @param {{ id: string, name: string }} lane @returns {string}
     */
    laneLabel(lane) {
      if (this.isUnassigned(lane)) return this.t('unassigned');
      return lane?.name || this.t('unnamedLane');
    },
    /** Zahl der Bänder als CSS-Variable des Rasters. @returns {string} */
    laneCountStyle() { return `--fc-lane-count: ${this.model.lanes.length}`; },
    /** Eine Bahn anlegen und ihr Namensfeld fokussieren (nur über die Werkzeugleiste). */
    addLaneAndFocus() {
      const id = this.model.addLane({});
      this.$nextTick(() => {
        /** @type {HTMLInputElement|null} */ (this.$root.querySelector(`.df__lane-name[data-lane-id="${CSS.escape(id)}"]`))?.focus();
      });
    },

    // ─── Kette ─────────────────────────────────────────
    /** Nummer eines Schritts, zweistellig („01“). @param {number} i @returns {string} */
    stepNum(i) { return String(i + 1).padStart(2, '0'); },
    /** @param {{ laneId: string }} step @param {string} laneId @returns {boolean} die Karte liegt in dieser Bahn */
    inLane(step, laneId) { return step.laneId === laneId; },
    /** Verbinder vor Schritt `i` (Einfügen), in der Bahn seiner Karte. @param {number} i @param {string} laneId @returns {boolean} */
    showGap(i, laneId) { return i > 0 && this.model.steps[i]?.laneId === laneId; },
    /** Schiene vor dem ersten Schritt, nur während einer Geste. @param {number} i @param {string} laneId @returns {boolean} */
    showStartRail(i, laneId) {
      return this.state.chainPreview !== null && i === 0 && this.model.steps[0]?.laneId === laneId;
    },
    /** Schiene hinter dem letzten Schritt, nur während einer Geste. @param {number} i @param {string} laneId @returns {boolean} */
    showEndRail(i, laneId) {
      return this.state.chainPreview !== null && i === this.model.steps.length - 1 && this.model.steps[i]?.laneId === laneId;
    },

    // ─── Vorschau der Kettengeste ──────────────────────
    /**
     * Die Lücke, in der der gezogene Schritt landet; ohne Geste oder an
     * alter Stelle `null`.
     * @returns {number|null}
     */
    get previewGap() {
      const p = this.state.chainPreview;
      if (!p) return null;
      const from = this.model.steps.findIndex((s) => s.id === p.id);
      if (from < 0 || p.index === from) return null;
      return p.index < from ? p.index : p.index + 1;
    },
    /** Klassen des Verbinders an Lücke `g`. @param {number} g @returns {string} */
    gapClass(g) {
      if (this.state.chainPreview === null) return '';
      return g === this.previewGap ? 'fc-connector--drop is-drop-target' : 'fc-connector--drop';
    },
    /** Klassen des Verbinders hinter Schritt `i`. @param {number} i @returns {string} */
    gapClassAfter(i) { return this.gapClass(i + 1); },
    /** Hervorhebung des ganzen Zielbands bei einem Bahnwechsel. @param {string} laneId @returns {string} */
    slotClass(laneId) {
      const p = this.state.chainPreview;
      if (!p || p.band !== laneId) return '';
      return this.model.steps.find((s) => s.id === p.id)?.laneId === laneId ? '' : 'is-drop-target';
    },
    /** Klassen der Karte: gezogen. @param {{ id: string }} step @returns {string} */
    cardClass(step) { return this.state.chainPreview?.id === step.id ? 'is-dragging' : ''; },

    // ─── Import ────────────────────────────────────────
    /** @param {{ moduleId: string }} opt @returns {string} Name des Quellmoduls */
    sourceName(opt) { return this.t(`modules.${opt.moduleId}.name`); },
    /** @param {{ instanceId: string }} opt @returns {boolean} */
    isImportPicked(opt) { return this.state.importPick === opt.instanceId; },
    /** @param {{ instanceId: string }} opt @returns {string} */
    importOptionClass(opt) { return this.isImportPicked(opt) ? 'df__import-option--selected' : ''; },
    /** Auswahl im Dialog übernehmen (an der Liste, nicht je Zeile). @param {Event} event */
    pickImport(event) {
      const v = /** @type {HTMLInputElement|null} */ (event?.target)?.value;
      if (typeof v === 'string' && v !== '') this.state.importPick = v;
    },

    /**
     * Quellen auflisten und den Dialog öffnen; ohne Quelle nur ein Hinweis.
     * @returns {void}
     */
    openImport() {
      const options = importOptionsOf(ctx.instances.list({ modules: [...IMPORT_SOURCES] }));
      if (options.length === 0) {
        ctx.notify(this.t('importEmptyHint'), 'info');
        return;
      }
      this.state.importOptions = options;
      this.state.importPick = options[0].instanceId;
      // Erst nach dem Rendern der Zeilen leiht der Dialog das Formular aus.
      this.$nextTick(() => {
        ctx.dialog.form({
          title: this.t('importTitle'),
          content: this.$refs.importForm,
          confirmLabel: this.t('importConfirm'),
          onConfirm: (body) => {
            const checked = /** @type {HTMLInputElement|null} */ (body?.querySelector('.df__import-option input[type="radio"]:checked'));
            if (checked) this.state.importPick = checked.value;
            this.runImport();
          },
        });
      });
    },

    /**
     * Die gewählte Instanz lesen, ihre Schritte ans Ende hängen (Bahn
     * „Nicht zugeordnet“), melden.
     * @returns {Promise<number>} Zahl der angehängten Schritte
     */
    async runImport() {
      const opt = this.state.importOptions.find((o) => o.instanceId === this.state.importPick);
      if (!opt || !ctx.instances) return 0;
      try {
        const steps = seedsFromRead(opt.moduleId, await ctx.instances.read(opt.instanceId));
        const n = this.model.appendSteps({ steps });
        ctx.notify(this.t('importDone', { n }), 'success');
        return n;
      } catch (err) {
        console.warn('deployment-flowchart: Import fehlgeschlagen', err);
        ctx.notify(this.t('importFailed'), 'error');
        return 0;
      }
    },
  }))],

  /** @type {import('./state.types.js').DeploymentFlowchartExports} */
  exports: {
    fileName: 'deployment-flowchart',
    tree() { return toJsonTree(this.model); },
  },
});
