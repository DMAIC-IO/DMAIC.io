/**
 * D.Mike — DoE-Berater: Viewmodel.
 *
 * Felder, Kommandos, Invariante und Ableitungen liegen im Model
 * (domain/model.js); die Agentenfläche entsteht aus dessen Schema. Reiter
 * über `x-set` auf dem Ansichtsfeld, Antworten, „Zurück“ und „Neu starten“
 * über `x-command`. Hier bleibt nur die Anzeige: Katalog, Phasenleitfaden,
 * CCD-Vergleich, Frage, Antwortspur, Fortschritt und Ergebniskarte als
 * übersetzte Texte. Kein UI-State, keine Viewmodel-Kommandos.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State, TABS } from '../domain/model.js';
import {
  DESIGN_IDS, PHASE_GUIDE_IDS, CCD_ROW_IDS, ANSWER_KEYS, isResultStep, resultDesignIdOf,
} from '../domain/wizard.js';

/** @typedef {import('../domain/model.types.js').StateModel & Pick<State, 'hasContent'>} DoeAdvisorModel */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<DoeAdvisorModel, {}>} */
  view() {
    return {
      // ─── Reiter ───────────────────────────────────────────
      /** Die Reiter in Anzeigereihenfolge. */
      get tabs() { return TABS; },
      /** @param {string} tab @returns {string} i18n-Text des Reiters */
      tabLabel(tab) { return this.t(`tab${tab[0].toUpperCase()}${tab.slice(1)}`); },
      /** @param {string} tab @returns {string} Klasse des aktiven Reiters */
      tabClass(tab) { return this.model.tab === tab ? 'dmike-tab--active' : ''; },

      // ─── Übersicht ────────────────────────────────────────
      get designIds() { return DESIGN_IDS; },
      get phaseGuideIds() { return PHASE_GUIDE_IDS; },
      get ccdRowIds() { return CCD_ROW_IDS; },
      /** @param {string} id @returns {string} Bezeichnung eines Versuchsplans */
      designName(id) { return this.t(`designs.${id}.name`); },
      /** @param {string} id @returns {string} Einsatzhinweis */
      designTip(id) { return this.t(`designs.${id}.tip`); },
      /** @param {string} id @returns {string} Faktorenspanne */
      designFactors(id) { return this.t(`designs.${id}.factors`); },
      /** @param {string} id @returns {string} Stufenangabe */
      designLevels(id) { return this.t(`designs.${id}.levels`); },
      /** @param {string} id @returns {string} Aufwandsangabe */
      designEffort(id) { return this.t(`designs.${id}.effort`); },
      /** @param {string} id @returns {string} Anmerkung */
      designNote(id) { return this.t(`designs.${id}.note`); },
      /** @param {string} id @returns {string} Phasenbezeichnung des Leitfadens */
      phasePhase(id) { return this.t(`phaseGuide.${id}.phase`); },
      /** @param {string} id @returns {string} Ziel einer Phase */
      phaseGoal(id) { return this.t(`phaseGuide.${id}.goal`); },
      /** @param {string} id @returns {string} passende Versuchspläne */
      phaseDesigns(id) { return this.t(`phaseGuide.${id}.designs`); },

      // ─── CCD-Vergleich ────────────────────────────────────
      /** @param {string} id @returns {string} Zeilenbeschriftung */
      ccdLabel(id) { return this.t(`ccd.rows.${id}.label`); },
      /** @param {string} id @returns {string} Wert der drehbaren Ausführung */
      ccdRotatable(id) { return this.t(`ccd.rows.${id}.rotatable`); },
      /** @param {string} id @returns {string} Wert der flächenzentrierten Ausführung */
      ccdFace(id) { return this.t(`ccd.rows.${id}.face`); },

      // ─── Berater ──────────────────────────────────────────
      /** Steht eine Empfehlung? */
      get isResult() { return isResultStep(this.model.currentStep); },
      /** Der empfohlene Versuchsplan; null ohne Empfehlung und bei „kein DoE“. */
      get resultDesignId() { return resultDesignIdOf(this.model.currentStep); },
      /** „Kein DoE“ als Empfehlung. */
      get isNoneResult() { return this.isResult && this.resultDesignId === null; },
      /** Eine Empfehlung mit Versuchsplan. */
      get hasDesignResult() { return this.resultDesignId !== null; },
      /** „Zurück“ zeigen: es gibt eine Spur oder eine Empfehlung. */
      get canGoBack() { return this.model.history.length > 0 || this.isResult; },
      /** Die Spur zeigen. */
      get hasTrail() { return this.model.history.length > 0; },
      /** @returns {string} die Frage des offenen Schritts */
      stepQuestion() { return this.t(`wizard.${this.model.currentStep}.question`); },
      /** @param {string} opt @returns {string} Beschriftung einer Antwortmöglichkeit */
      optionLabel(opt) { return this.t(`wizard.${this.model.currentStep}.options.${opt}.label`); },
      /** @param {string} opt @returns {string} Erläuterung einer Antwortmöglichkeit */
      optionHelp(opt) { return this.t(`wizard.${this.model.currentStep}.options.${opt}.help`); },
      /** @param {string} stepId @returns {string} Kürzel einer beantworteten Frage */
      trailShort(stepId) { return this.t(`wizard.${stepId}.short`); },
      /** @param {string} stepId @returns {string} die gegebene Antwort einer beantworteten Frage */
      trailAnswer(stepId) {
        const ans = /** @type {Record<string, string|undefined>} */ (this.model.answers)[ANSWER_KEYS[stepId]];
        return this.t(`wizard.${stepId}.options.${ans}.label`);
      },
      /** @param {string} stepId @param {number} i @returns {string} Schlüssel eines Spureintrags */
      trailKey(stepId, i) { return `${stepId}:${i}`; },
      /** @param {string} opt @param {number} i @returns {string} Schlüssel einer Antwortmöglichkeit */
      optionKey(opt, i) { return `${opt}:${i}`; },
      /** @returns {string} Fortschritt „Schritt n von ca. m“ oder „Empfehlung“ */
      stepLabel() {
        if (this.isResult) return this.t('wizardResultLabel');
        const current = this.model.history.length + 1;
        return this.t('wizardStepOf', { current, total: Math.max(current + 1, 4) });
      },

      // ─── Ergebniskarte ────────────────────────────────────
      /** @returns {string} Bezeichnung des empfohlenen Versuchsplans */
      resultName() { return this.t(`designs.${this.resultDesignId}.name`); },
      /** @returns {string} Begründung der Empfehlung */
      resultReasoning() { return this.t(`wizard.reasoning.${this.resultDesignId}`); },
      /** @returns {string} Einsatzhinweis */
      resultTip() { return this.t(`designs.${this.resultDesignId}.tip`); },
      /** @returns {string} Anmerkung */
      resultNote() { return this.t(`designs.${this.resultDesignId}.note`); },
      /** @returns {string} Faktorenspanne */
      resultFactors() { return this.t(`designs.${this.resultDesignId}.factors`); },
      /** @returns {string} Stufenangabe */
      resultLevels() { return this.t(`designs.${this.resultDesignId}.levels`); },
      /** @returns {string} Aufwandsangabe */
      resultEffort() { return this.t(`designs.${this.resultDesignId}.effort`); },
    };
  },
});
