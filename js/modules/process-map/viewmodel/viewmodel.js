/**
 * D.Mike — Process Map: Viewmodel.
 *
 * Schritte, Inputs/Outputs, Unterschritte, Loops und alle Kommandos liegen
 * im Model (domain/model.js); die Agentenfläche entsteht aus dessen Schema.
 * Wertart, Input-Typ, Loop an/aus, Löschen und die Unterschritte lösen ihre
 * Kommandos im Template aus (`x-command`, `x-field`), das Verschieben die
 * drei Gesten (interaction/gestures.js). Der view-Block ist in Teile
 * gegliedert: Kette (hier), Inputs/Outputs (io.js), Loop-Bänder (loops.js)
 * und die Übernahme aus einem SIPOC (import.js).
 * Hier bleiben: Abzeichen-Texte und -Klassen, Lücken und Vorschau der
 * Kettengeste, der Fokus nach dem Anlegen eines Schritts bzw. Unterschritts
 * und die Exporte (Zeilen, JSON-Baum, Bild). Die Höhe der Textfelder regelt
 * CSS (`field-sizing: content`).
 */
import { createModule } from '../../../core/template-module.js';
import { substepsView } from '../../../core/flowchart/substeps-view.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { stepNumber } from '../domain/loops.js';
import { chain, substeps, io } from '../interaction/gestures.js';
import { toRows, toExportJSON, XLSX_SHEET } from '../io/export.js';
import { buildPmapScene, renderSceneToSVG, SCENE_VARS, FONT } from '../io/scene.js';
import { ioPart } from './io.js';
import { loopsPart } from './loops.js';
import { importPart } from './import.js';
import { UiState } from './state.js';

/** @typedef {import('../domain/model.types.js').StateFields['steps'][number]} Step */

/**
 * Textbreite für den Bildexport über einen Canvas (einmal je Aufruf von
 * `image()` angelegt).
 * @returns {(text: string, size: number, weight?: number) => number}
 */
function canvasMeasure() {
  const c = document.createElement('canvas').getContext('2d');
  return (text, size, weight) => {
    if (!c) return String(text).length * size * 0.6;
    c.font = `${weight || 400} ${size}px ${FONT}`;
    return c.measureText(String(text)).width;
  };
}

/**
 * Zahl der Unterschritte je Schritt.
 * @param {ReadonlyArray<Step>} steps @returns {Map<string, number>}
 */
const substepCounts = (steps) => new Map(steps.map((s) => [s.id, s.substeps.length]));

/** @type {import('./state.types.js').ProcessMapViewFn} */
const chainPart = (ctx) => {
  /** Schritt, dessen „+ Detail-Schritt“ eben geklickt wurde (bis zur nächsten Änderung). */
  let substepClick = /** @type {string|null} */ (null);
  return {
    init() {
      // Fokus nach „+ Detail-Schritt“: nur nach einem Klick auf den
      // Anlege-Knopf dieses Schritts, nie nach Rückgängig/Wiederholen oder
      // einem Agentenaufruf. Das geteilte Teil-Template bleibt unverändert.
      let before = substepCounts(this.model.steps);
      this.$watch(() => this.model.steps.map((s) => s.substeps.length).join(), () => {
        const prev = before;
        before = substepCounts(this.model.steps);
        const id = substepClick;
        substepClick = null;
        if (!id || (before.get(id) ?? 0) <= (prev.get(id) ?? 0)) return;
        this.$nextTick(() => {
          const titles = this.$root.querySelectorAll(`.fc-substeps[data-step-id="${CSS.escape(id)}"] .fc-substep-title`);
          /** @type {HTMLInputElement|undefined} */ (titles[titles.length - 1])?.focus();
        });
      });
    },

    /**
     * Klicks in der Kette (Capture-Phase): merkt sich einen Klick auf
     * „+ Detail-Schritt“ für den Fokus nach dem Anlegen. Das Kommando löst
     * der Knopf selbst aus; bei echter Maus läuft der Watcher schon zwischen
     * den Listenern, der Merker muss also vor dem Knopf greifen.
     * @param {Event} event
     */
    noteClick(event) {
      const add = event?.target instanceof Element ? event.target.closest('.fc-substep-add') : null;
      if (add) substepClick = /** @type {HTMLElement|null} */ (add.closest('.fc-substeps'))?.dataset.stepId ?? null;
    },

    /**
     * DOM-id je Instanz, wahlweise je Element.
     * @param {string} name @param {string} [sub] z. B. die Schritt-id @returns {string}
     */
    fieldId(name, sub) { return `pmap-${name}-${ctx.instanceId}${sub ? `-${sub}` : ''}`; },

    // ─── Kette ─────────────────────────────────────────
    /** Nummer eines Schritts, zweistellig („01“). @param {number} i @returns {string} */
    stepNum(i) { return stepNumber(i); },
    /** Verbinder vor dem ersten Schritt. @param {number} i @returns {boolean} */
    isFirst(i) { return i === 0; },
    /**
     * Einen Schritt an Lücke `i` anlegen und seinen Titel fokussieren
     * (Werkzeugleiste und Verbinder).
     * @param {number} i Lücke (0 = vor dem ersten, Länge = ans Ende)
     * @returns {string} id des neuen Schritts
     */
    addStepAt(i) {
      const id = this.model.addStep({ atIndex: i });
      this.$nextTick(() => {
        /** @type {HTMLTextAreaElement|null} */ (this.$root.querySelector(`.pmap__step-row[data-step-id="${CSS.escape(id)}"] .pmap__step-title`))?.focus();
      });
      return id;
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
    /** Lücke hinter Schritt `i`. @param {number} i @returns {number} */
    gapAfter(i) { return i + 1; },
    /** Klasse der Kartenzelle: gezogen. @param {Step} step @returns {string} */
    rowClass(step) { return this.state.chainPreview?.id === step.id ? 'is-dragging' : ''; },
    /**
     * Statusstreifen der Karte; ohne Wertart keiner, damit die Farbe als
     * Urteil gelesen wird, nicht als Vorgabe.
     * @param {Step} step @returns {string}
     */
    cardClass(step) { return step.valueType ? `fc-card--accent pmap__step-card--${step.valueType}` : ''; },

    // ─── Wertart ───────────────────────────────────────
    /** @param {Step} step @returns {string} Kürzel oder Strich */
    valueBadgeLabel(step) { return step.valueType ? this.t(step.valueType) : '–'; },
    /** @param {Step} step @returns {string} Langtext oder „Wertschöpfung“ */
    valueBadgeTitle(step) { return step.valueType ? this.t(`${step.valueType}Long`) : this.t('valueTypeLabel'); },
    /** @param {Step} step @returns {string} */
    valueBadgeClass(step) { return `pmap__value-badge--${step.valueType || 'none'}`; },
  };
};

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  gestures: [chain, substeps, io],
  config: {
    actions: [
      { icon: 'action.add', title: 'addStep', variant: 'primary', agentAction: 'addStep',
        onClick: (/** @type {any} */ d) => d.addStepAt(d.model.steps.length) },
      { icon: 'action.upload', title: 'importFromSipoc', onClick: (/** @type {any} */ d) => d.openImport() },
    ],
  },
  view: [substepsView, chainPart, ioPart, loopsPart, importPart],

  /** @type {import('./state.types.js').ProcessMapExports} */
  exports: {
    fileName: 'process-map',
    table() { return toRows(this.model.steps, this.t); },
    tables() { return { [XLSX_SHEET]: toRows(this.model.steps, this.t) }; },
    tree() { return toExportJSON(this.model.steps, new Date().toISOString()); },
    image() {
      const scene = buildPmapScene(this.model.steps, {
        t: this.t, colors: this.cssVars(SCENE_VARS), measure: canvasMeasure(),
      });
      return renderSceneToSVG(scene);
    },
  },
});
