/**
 * D.Mike — Process Map: Loop-Bänder (Teil des view-Blocks).
 *
 * Je Loop ein Band unter der Output-Zeile, in Reihenfolge der Quellschritte.
 * Die Schienen (Spalten mit Senkrechten, Durchlässe tieferer Bänder,
 * Pfeilspitzen) rechnen die reinen Funktionen aus domain/loops.js; hier nur
 * Klassen, Spaltenbreiten, die Ziel-Auswahl und das Anlegen mit Fokus.
 * Bedingung und Rework-Titel binden im Template (`x-field`), Loop an/aus,
 * Entfernen und Rework entfernen über `x-command`.
 */
import { runUiCommand } from '../../../core/command-directives.js';
import { markRejection, clearRejection } from '../../../core/param-input.js';
import { loopLanes, loopRailCells, loopPassColumns, loopArrowColumns, loopTargetOptions } from '../domain/loops.js';

/** @typedef {import('../domain/model.types.js').StateFields['steps'][number]} Step */
/** @typedef {{ col: number, pass: boolean }} Col */
/**
 * @typedef {object} LoopRow
 * @property {string} stepId Schritt mit dem Loop
 * @property {number} sourceIdx @property {number} targetIdx −1 ohne gültiges Ziel
 * @property {string[]} railCells Modifikator je Schrittspalte
 * @property {number[]} passCols Spalten, durch die tiefere Bänder aufsteigen
 * @property {number[]} arrowCols Pfeilspitzen (nur im obersten Band)
 * @property {Col[]} preCols leere Spalten links vom Band
 * @property {number} leadSpan Spalten des Bands (bis zur Quelle)
 * @property {Col[]} trailCols leere Spalten rechts der Quelle
 */

/** Höchstbreite eines Rework-Titels in Zeichen. */
const TITLE_SIZE_MAX = 48;

/**
 * Die Bänder in Reihenfolge der Quellschritte mit allen Spalten.
 * @param {ReadonlyArray<Step>} steps @returns {LoopRow[]}
 */
function loopRowsOf(steps) {
  const lanes = loopLanes(steps);
  const n = steps.length;
  const pass = loopPassColumns(n, lanes);
  const arrows = loopArrowColumns(n, lanes);
  return lanes.map(({ step, sourceIdx, targetIdx }, lane) => {
    const passCols = pass[lane];
    const before = passCols.filter((c) => c < sourceIdx);
    const leadStart = before.length ? before[before.length - 1] + 1 : 0;
    /** @param {number} c @returns {Col} */
    const col = (c) => ({ col: c, pass: passCols.includes(c) });
    return {
      stepId: step.id,
      sourceIdx,
      targetIdx,
      railCells: loopRailCells(n, sourceIdx, targetIdx),
      passCols,
      arrowCols: lane === 0 ? arrows : [],
      preCols: Array.from({ length: leadStart }, (_, c) => col(c)),
      leadSpan: sourceIdx - leadStart + 1,
      trailCols: Array.from({ length: n - sourceIdx - 1 }, (_, k) => col(sourceIdx + 1 + k)),
    };
  });
}

/** @type {LoopRow} */
const NO_ROW = Object.freeze({
  stepId: '', sourceIdx: -1, targetIdx: -1, railCells: [], passCols: [], arrowCols: [], preCols: [], leadSpan: 1, trailCols: [],
});

/** @type {import('./state.types.js').ProcessMapViewFn} */
export const loopsPart = () => ({
  /** Die Bänder aller Loops (reine Funktion des Models, ohne Messen). @returns {LoopRow[]} */
  get loopRows() { return loopRowsOf(this.model.steps); },
  /** Band des Schritts; ohne Loop ein leeres. @param {Step} step @returns {LoopRow} */
  loopRow(step) { return this.loopRows.find((r) => r.stepId === step.id) ?? NO_ROW; },
  /** @param {Step} step @returns {string[]} Modifikator je Schienenzelle */
  railCells(step) { return this.loopRow(step).railCells; },
  /**
   * Klassen der Schienenzelle `ci`: eigener Modifikator, Durchlass, Pfeil.
   * @param {Step} step @param {number} ci @returns {string}
   */
  railCellClass(step, ci) {
    const row = this.loopRow(step);
    const cell = row.railCells[ci];
    return [
      cell ? `pmap__loop-rail-cell--${cell}` : '',
      row.passCols.includes(ci) ? 'pmap__loop-rail-cell--pass' : '',
      row.arrowCols.includes(ci) ? 'pmap__loop-rail-cell--arrow' : '',
    ].filter(Boolean).join(' ');
  },
  /** @param {Step} step @returns {Col[]} leere Spalten links vom Band */
  preCols(step) { return this.loopRow(step).preCols; },
  /** @param {Step} step @returns {Col[]} leere Spalten rechts der Quelle */
  trailCols(step) { return this.loopRow(step).trailCols; },
  /** @param {Step} step @returns {number} Spalten des Bands */
  leadSpan(step) { return this.loopRow(step).leadSpan; },
  /** @param {Col} c @returns {string} Durchlass einer tieferen Schiene */
  colClass(c) { return c.pass ? 'pmap__loop-col--pass' : ''; },
  /** Schlüssel einer leeren Spalte. @param {string} side @param {Col} c @returns {string} */
  colKey(side, c) { return `${side}-${c.col}`; },

  // ─── Schalter und Ziel ─────────────────────────────
  /** @param {Step} step @returns {string} */
  loopToggleClass(step) { return step.loop ? 'pmap__step-loop-toggle--active' : ''; },
  /** Argument `on` für `setLoop` als Text: schaltet um. @param {Step} step @returns {'true'|'false'} */
  loopArg(step) { return step.loop ? 'false' : 'true'; },
  /** @param {Step} step @returns {'true'|'false'} Wert für `aria-pressed` */
  loopPressed(step) { return step.loop ? 'true' : 'false'; },
  /**
   * Ziele der Auswahl: alle Schritte vor der Quelle.
   * @param {number} idx Index der Quelle @returns {Array<{ id: string, label: string }>}
   */
  targetOptions(idx) { return loopTargetOptions(this.model.steps, idx, this.t('csvStep')); },
  /** @param {Step} step @param {{ id: string }} opt @returns {boolean} */
  isTarget(step, opt) { return step.loop?.targetStepId === opt.id; },
  /** @param {Step} step @returns {boolean} kein gültiges Ziel gewählt */
  noTarget(step) { return !step.loop?.targetStepId; },
  /**
   * Ziel aus der Auswahl übernehmen; leer löscht es. Eine Ablehnung zeigt
   * sich am Feld, die Auswahl springt auf das gespeicherte Ziel zurück.
   * @param {Step} step @param {Event} event
   */
  async loopTargetChanged(step, event) {
    const el = /** @type {HTMLSelectElement} */ (event.target);
    const stepId = step.id;
    const r = await runUiCommand(this._ui, 'setLoopTarget', { stepId, targetStepId: el.value || null });
    if (r.ok) {
      clearRejection(el);
      return;
    }
    if (!('error' in r)) return;
    console.warn('process-map: Loop-Ziel abgelehnt', r.error);
    el.value = this.model.steps.find((s) => s.id === stepId)?.loop?.targetStepId ?? '';
    markRejection(el, this.t(r.error?.hintKey || 'loopTargetNotBefore'));
  },

  // ─── Rework-Schritte ───────────────────────────────
  /**
   * Breite eines Rework-Titels in Zeichen: wächst mit dem Titel, gedeckelt.
   * @param {{ title: string }} ls @returns {number}
   */
  loopStepTitleSize(ls) {
    const len = Math.max((ls.title || '').length, this.t('loopStepPlaceholder').length);
    return Math.min(len + 1, TITLE_SIZE_MAX);
  },
  /**
   * Einen Rework-Schritt anlegen und seinen Titel fokussieren.
   * @param {string} stepId @returns {string} id des Rework-Schritts
   */
  addLoopStepAt(stepId) {
    const id = this.model.addLoopStep({ stepId });
    this.$nextTick(() => {
      /** @type {HTMLInputElement|null} */ (this.$root.querySelector(`.pmap__loop-step-item[data-loop-step-id="${CSS.escape(id)}"] .pmap__loop-step-title`))?.focus();
    });
    return id;
  },
});
