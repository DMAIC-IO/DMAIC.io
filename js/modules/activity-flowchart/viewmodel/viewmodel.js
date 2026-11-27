/**
 * D.Mike — Activity-Flowchart: Viewmodel.
 *
 * Schritte, Bänder und Kommandos liegen im Model (domain/model.js); die
 * Agentenfläche entsteht aus dessen Schema. Anlegen, Löschen, der
 * Wiedereinstieg und die Unterschritte lösen ihre Kommandos im Template aus
 * (`x-command`, `x-field`), das Verschieben die Gesten (interaction/gestures.js).
 * Exporte: Mapper nach Datenform, Menü und Datei baut der Kern.
 * Hier bleiben: das Rasterlayout (Zeile = Band, Spalte aus `layoutFor`), die
 * Lücken und Schienen der Kette, die Vorschau der Geste, das Einfügemenü, der
 * Auswahlmodus für den Wiedereinstieg, das Hineinscrollen neuer Karten und der
 * Importdialog über den Instanzendienst. Die Bandzeilen samt übersetzter
 * Beschriftung liest die Ansicht aus `bands` (derived, Getter auf dem Scope).
 * Die Höhe der Textfelder regelt CSS (`field-sizing: content`).
 */
import { createModule } from '../../../core/template-module.js';
import { substepsView } from '../../../core/flowchart/substeps-view.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { MAIN_BRANCH, branchOwnerId, indexToGap } from '../domain/branches.js';
import { bandFlow, layoutFor } from '../domain/layout.js';
import { IMPORT_SOURCES, seedsFromRead } from '../domain/import.js';
import { flow, substeps } from '../interaction/gestures.js';
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
  const canvas = root.querySelector('.af__canvas');
  const card = canvas?.querySelector(`.af__step[data-step-id="${CSS.escape(id)}"]`);
  if (!canvas || !card) return;
  const c = canvas.getBoundingClientRect();
  const r = card.getBoundingClientRect();
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

/**
 * @typedef {{ id: string, kind: string, branchId: string, title: string,
 *   decision: { label: string, noTarget: string }|null }} ViewStep
 * @typedef {{ id: string, ownerId: string|null, label: string, depth: number }} ViewBand
 */

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  gestures: [flow, substeps],
  config: {
    actions: [
      { icon: 'action.add', title: 'addStep', variant: 'primary', command: 'addStep', args: {} },
      { icon: 'action.branch', title: 'addDecision', command: 'addStep', args: { kind: 'decision' } },
      { icon: 'action.upload', title: 'importFrom', onClick: (d) => d.openImport() },
    ],
  },
  view: [substepsView, /** @type {import('./state.types.js').ActivityFlowchartViewFn} */ ((ctx) => ({
    init() {
      // Eine neue Karte (Werkzeugleiste, Verbinder, Band-Ende, Agent, Wiederholen) ins Bild holen.
      let known = new Set(this.model.steps.map((s) => s.id));
      this.$watch(() => this.model.steps.map((s) => s.id).join('\n'), () => {
        const ids = this.model.steps.map((s) => s.id);
        const added = ids.find((id) => !known.has(id));
        known = new Set(ids);
        if (added) this.$nextTick(() => revealStep(this.$root, added));
      });
    },

    /** DOM-id je Instanz. @param {string} name @returns {string} */
    fieldId(name) { return `af-${name}-${ctx.instanceId}`; },

    // ─── Schritte ──────────────────────────────────────
    /** Nummer eines Schritts, zweistellig („01“). @param {number} i @returns {string} */
    stepNum(i) { return String(i + 1).padStart(2, '0'); },
    /** @param {{ kind: string }} step @returns {boolean} der Schritt ist eine Raute */
    isDecision(step) { return step?.kind === 'decision'; },
    /**
     * Anzeigename eines Schritts: Frage der Raute bzw. Titel, sonst Platzhalter.
     * @param {ViewStep} step @returns {string}
     */
    stepLabel(step) {
      if (step?.kind === 'decision') return step.decision?.label || this.t('unnamedDecision');
      return step?.title || this.t('unnamedStep');
    },
    /**
     * Wiedereinstieg einer Raute als Name der Zielkarte; ein Rücksprung trägt
     * „↩“ davor, ohne Ziel `''`.
     * @param {ViewStep} step @returns {string}
     */
    branchTarget(step) {
      const target = step?.decision?.noTarget;
      if (!target || target === 'end') return '';
      const steps = this.model.steps;
      const at = steps.findIndex((s) => s.id === target);
      if (at === -1) return '';
      const own = steps.findIndex((s) => s.id === step.id);
      const label = this.stepLabel(steps[at]);
      return at < own ? `↩ ${label}` : label;
    },

    // ─── Raster: Zeile = Band, Spalte aus dem gepackten Layout ─────
    /** @returns {boolean} es gibt außer dem Hauptpfad ein Band (dann mit Beschriftungsspalte) */
    hasBands() { return this.bands.length > 1; },
    /** @param {ViewBand} band @returns {boolean} */
    isMainBand(band) { return band?.id === MAIN_BRANCH; },
    /** Spaltenversatz durch die Beschriftungsspalte. @returns {number} */
    gridOffset() { return this.hasBands() ? 1 : 0; },
    /** Zeile eines Bands im Raster (1-basiert). @param {string} bandId @returns {number} */
    bandRow(bandId) { return this.bands.findIndex((b) => b.id === bandId) + 1; },
    /** @returns {string} Zahl der Bänder als CSS-Variable des Rasters */
    bandGridStyle() { return `--fc-lane-count: ${this.bands.length}`; },
    /** @returns {string} ohne Bänder Platz für die Schiene vor der ersten Karte */
    canvasClass() { return this.hasBands() ? '' : 'af__canvas--plain'; },
    /** Platz einer Karte bzw. Raute im Raster. @param {ViewStep} step @returns {string} */
    stepStyle(step) {
      const col = Number(layoutFor(this.model).colOf.get(step.id)) + this.gridOffset();
      return `grid-row: ${this.bandRow(step.branchId)}; grid-column: ${col}`;
    },
    /** Bahn eines Bands über die ganze Breite. @param {ViewBand} band @returns {string} */
    laneStyle(band) {
      const off = this.gridOffset();
      return `grid-row: ${this.bandRow(band.id)}; grid-column: ${1 + off} / ${layoutFor(this.model).count + off + 2}`;
    },
    /**
     * Klassen einer Karte: Art, Auswahlmodus, offenes Einfügemenü, gezogen.
     * @param {ViewStep} step @param {number} i @returns {string}
     */
    stepClass(step, i) {
      return [
        this.isDecision(step) ? 'af__step--decision' : 'af__step--activity',
        this.pickClass(step),
        this.isInsertMenuOpen(i) ? 'af__step--menu-open' : '',
        this.state.flowPreview?.id === step.id ? 'is-dragging' : '',
      ].filter(Boolean).join(' ');
    },
    /**
     * Läuft das Band des Schritts nach links (Rücksprung seiner Raute)?
     * @param {ViewStep|undefined} step @returns {boolean}
     */
    isBackwardStep(step) {
      const owner = this.model.steps.find((s) => s.id === branchOwnerId(step?.branchId));
      return !!(owner && bandFlow(this.model.steps, owner)?.backward);
    },
    /** Pfeil vor Schritt `i`, im Rückwärtsband gedreht. @param {number} i @returns {string} */
    arrowClass(i) { return this.isBackwardStep(this.model.steps[i]) ? 'af__connector-arrow--back' : ''; },

    // ─── Band-Ende und Wiedereinstieg ──────────────────
    /** @param {ViewBand} band @returns {ViewStep|null} die Raute des Bands */
    ownerOf(band) { return this.model.steps.find((s) => s.id === band?.ownerId) ?? null; },
    /** @param {ViewBand} band @returns {boolean} das Band hat einen Wiedereinstieg in eine Karte */
    hasRejoin(band) { return (this.ownerOf(band)?.decision?.noTarget || 'end') !== 'end'; },
    /** Beschriftung der Einladung bzw. Marke: Zielname oder „Wiedereinstieg wählen“. @param {ViewBand} band @returns {string} */
    exitPickLabel(band) {
      const owner = this.ownerOf(band);
      if (!owner || !this.hasRejoin(band)) return this.t('pickEntry');
      return this.branchTarget(owner) || this.t('pickEntry');
    },
    /**
     * Platz des Band-Endes: direkt hinter der letzten eigenen Karte (im
     * Rückwärtsband davor).
     * @param {ViewBand} band @returns {string}
     */
    tailStyle(band) {
      const { colOf } = layoutFor(this.model);
      const owner = this.ownerOf(band);
      const cols = owner ? [Number(colOf.get(owner.id))] : [0];
      for (const s of this.model.steps) if (s.branchId === band.id) cols.push(Number(colOf.get(s.id)));
      const back = owner ? !!bandFlow(this.model.steps, owner)?.backward : false;
      const edge = back ? Math.min(...cols) - 1 : Math.max(...cols) + 1;
      return `grid-row: ${this.bandRow(band.id)}; grid-column: ${edge + this.gridOffset()}`;
    },
    /** @param {ViewBand} band @returns {string} Klasse des Band-Endes im Rückwärtsband */
    tailClass(band) {
      const owner = this.ownerOf(band);
      return owner && bandFlow(this.model.steps, owner)?.backward ? 'af__tail--back' : '';
    },
    /**
     * Wiedereinstiegsmarken: je Band mit Ziel eine Marke in seiner Zeile unter
     * der Zielkarte.
     * @returns {Array<{ id: string, ownerId: string, style: string }>}
     */
    rejoinMarkers() {
      const { colOf } = layoutFor(this.model);
      const off = this.gridOffset();
      return this.bands.flatMap((band, i) => {
        const owner = this.ownerOf(band);
        const target = owner?.decision?.noTarget;
        if (!owner || !target || target === 'end' || !colOf.has(target)) return [];
        return [{ id: band.id, ownerId: owner.id, style: `grid-row: ${i + 1}; grid-column: ${Number(colOf.get(target)) + off}` }];
      });
    },
    /** @param {string} bandId @returns {ViewBand|undefined} */
    bandById(bandId) { return this.bands.find((b) => b.id === bandId); },
    /** Beschriftung der Marke eines Bands. @param {string} bandId @returns {string} */
    markerLabel(bandId) { return this.exitPickLabel(this.bandById(bandId)); },

    // ─── Vorschau der Geste ────────────────────────────
    /** Schiene vor dem ersten Schritt, nur während einer Geste. @param {number} i @returns {boolean} */
    showStartRail(i) { return this.state.flowPreview !== null && i === 0; },
    /** Schiene hinter dem letzten Schritt, nur während einer Geste. @param {number} i @returns {boolean} */
    showEndRail(i) { return this.state.flowPreview !== null && i === this.model.steps.length - 1; },
    /**
     * Die Lücke (vor dem Verschieben gezählt), in der der gezogene Schritt bzw.
     * Block landet; ohne Geste, bei Bandziel und an alter Stelle `null`.
     * @returns {number|null}
     */
    get previewGap() {
      const p = this.state.flowPreview;
      if (!p) return null;
      const steps = this.model.steps;
      const from = steps.findIndex((s) => s.id === p.id);
      if (from < 0 || p.index === from) return null;
      return indexToGap(steps, p.id, p.index);
    },
    /** Klassen des Verbinders an Lücke `g`. @param {number} g @returns {string} */
    gapClass(g) {
      if (this.state.flowPreview === null) return '';
      return g === this.previewGap ? 'fc-connector--drop is-drop-target' : 'fc-connector--drop';
    },
    /** Klassen der Schiene hinter Schritt `i`. @param {number} i @returns {string} */
    gapClassAfter(i) { return this.gapClass(i + 1); },
    /** Hervorhebung der ganzen Bandzeile bei einem Bandwechsel. @param {string} bandId @returns {string} */
    laneClass(bandId) {
      const p = this.state.flowPreview;
      if (!p || p.band !== bandId) return '';
      return this.model.steps.find((s) => s.id === p.id)?.branchId === bandId ? '' : 'is-drop-target';
    },

    // ─── Einfügemenü am Verbinder ──────────────────────
    /** Menü an Lücke `i` öffnen bzw. schließen. @param {number} i @param {string} bandId */
    toggleInsertMenu(i, bandId) {
      this.state.insertMenu = this.state.insertMenu?.index === i ? null : { index: i, bandId };
    },
    /** @param {number} i @returns {boolean} */
    isInsertMenuOpen(i) { return this.state.insertMenu?.index === i; },
    /** Menü schließen (nach der Wahl). */
    closeInsertMenu() { this.state.insertMenu = null; },

    // ─── Auswahlmodus: Wiedereinstieg auf dem Diagramm wählen ──
    /** Auswahl für ein Band an- bzw. abschalten. @param {string} bandId */
    togglePick(bandId) { this.state.pickBand = this.state.pickBand === bandId ? null : bandId; },
    /** Auswahl beenden. */
    cancelPick() { this.state.pickBand = null; },
    /**
     * Kann der Schritt Wiedereinstieg des gewählten Bands werden? Ein anderer
     * Schritt im Band, in dem die Raute steht.
     * @param {ViewStep} step @returns {boolean}
     */
    isPickTarget(step) {
      const bandId = this.state.pickBand;
      if (!bandId) return false;
      const owner = this.model.steps.find((s) => s.id === branchOwnerId(bandId));
      if (!owner || step.id === owner.id) return false;
      return step.branchId === owner.branchId;
    },
    /** @param {ViewStep} step @returns {string} hervorgehoben oder abgeblendet, ohne Auswahl leer */
    pickClass(step) {
      if (!this.state.pickBand) return '';
      return this.isPickTarget(step) ? 'af__step--pickable' : 'af__step--dimmed';
    },
    /**
     * Klick auf eine Karte: im Auswahlmodus wird sie Wiedereinstieg, sonst nichts.
     * @param {ViewStep} step
     */
    pickStep(step) {
      if (!this.isPickTarget(step)) return;
      const stepId = branchOwnerId(this.state.pickBand);
      this.state.pickBand = null;
      this.model.setDecisionTarget({ stepId, target: step.id });
    },
    /**
     * Klick auf die Leinwand bzw. Escape: Menü und Auswahl schließen — nicht,
     * wenn die Geste das Ereignis schon genommen hat (Escape bricht sie ab).
     * @param {Event} [event]
     */
    closeOverlays(event) {
      if (event?.defaultPrevented) return;
      this.state.insertMenu = null;
      this.state.pickBand = null;
    },

    // ─── Import ────────────────────────────────────────
    /** @param {{ moduleId: string }} opt @returns {string} Name des Quellmoduls */
    sourceName(opt) { return this.t(`modules.${opt.moduleId}.name`); },
    /** @param {{ instanceId: string }} opt @returns {boolean} */
    isImportPicked(opt) { return this.state.importPick === opt.instanceId; },
    /** @param {{ instanceId: string }} opt @returns {string} */
    importOptionClass(opt) { return this.isImportPicked(opt) ? 'af__import-option--selected' : ''; },
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
            const checked = /** @type {HTMLInputElement|null} */ (body?.querySelector('.af__import-option input[type="radio"]:checked'));
            if (checked) this.state.importPick = checked.value;
            this.runImport();
          },
        });
      });
    },

    /**
     * Die gewählte Instanz lesen, ihre Schritte als Aktivitäten ans Ende des
     * Hauptpfads hängen, melden.
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
        console.warn('activity-flowchart: Import fehlgeschlagen', err);
        ctx.notify(this.t('importFailed'), 'error');
        return 0;
      }
    },
  }))],

  /** @type {import('./state.types.js').ActivityFlowchartExports} */
  exports: {
    fileName: 'activity-flowchart',
    tree() { return toJsonTree(this.model); },
  },
});
