/**
 * D.Mike — DoE-Berater Module (doe-advisor.js)
 * Overview of available DoE designs and a guided wizard that recommends
 * the right design based on the user's project context.
 * DMAIC phase: Improve
 *
 * State + wizard decision tree live in doe-advisor-model.js; this file is the
 * view layer (i18n formatting + event handlers) wired up via createModule.
 *
 * @agent  Vollständig über das Viewmodel steuerbar: der angezeigte Bereich
 *   und der ganze Weg durch den Berater — antworten, zurückgehen, neu
 *   beginnen. Die Oberfläche behält nur die Anzeige: Katalog, Fragen,
 *   Antwortspur und Empfehlung sind übersetzte Texte und stehen in keinem
 *   Feld.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum } from '../../core/agent/agent-argcheck.js';
import {
  State,
  DESIGN_IDS,
  PHASE_GUIDE_IDS,
  CCD_ROW_IDS,
  ANSWER_KEYS,
} from './doe-advisor-model.js';

/** Die Bereiche des Moduls — die Wertemenge von `switchTab`. */
const TABS = ['overview', 'wizard', 'ccd'];

/**
 * @typedef {object} Recommendation
 * @property {string} designId  der Schlüssel des empfohlenen Versuchsplans, z. B. `ccd-rotatable`
 * @property {string} name  die Bezeichnung des Versuchsplans, wie die Ergebniskarte sie zeigt
 * @property {string} factors  die Faktorenspanne, wie die Ergebniskarte sie zeigt
 * @property {string} levels  die Stufenangabe, wie die Ergebniskarte sie zeigt
 * @property {string} effort  die Aufwandsangabe, wie die Ergebniskarte sie zeigt
 */

/**
 * @typedef {object} AgentRead
 * @property {'overview'|'wizard'|'ccd'} tab  the shown section
 * @property {string} currentStep  [via: answer, back, restart] id of the open question, or `result:<key>` once a recommendation stands
 * @property {object} answers  the given answers, one per question
 * @property {string[]} history  ids of the answered questions, in answering order
 * @property {string[]} currentOptions  the answer options the open question accepts; empty on a recommendation
 * @property {Recommendation|null} recommendation  der empfohlene Versuchsplan; leer, solange keine Empfehlung steht
 */
export default createModule({
  config: {
    id: 'doe-advisor',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.doe-advisor',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Berater-Zustand und die Antwortmöglichkeiten der offenen Frage
       */
      read(options) {
        return readAgentState('doe-advisor', {
          ...this.model.toJSON(),
          currentOptions: this.model.currentOptions,
          recommendation: this.recommendation(),
        }, options);
      },

      // ─── Static id lists (iterated by x-for) ────────────────
      designIds: DESIGN_IDS,
      phaseGuideIds: PHASE_GUIDE_IDS,
      ccdRowIds: CCD_ROW_IDS,

      // ─── Overview: design catalog cells ─────────────────────
      /** @noagent view transform: die Bezeichnung eines Versuchsplans. */
      designName: (id) => _t(`designs.${  id  }.name`),
      /** @noagent view transform: der Einsatzhinweis eines Versuchsplans. */
      designTip: (id) => _t(`designs.${  id  }.tip`),
      /** @noagent view transform: die Faktorenspanne eines Versuchsplans. */
      designFactors: (id) => _t(`designs.${  id  }.factors`),
      /** @noagent view transform: die Stufenangabe eines Versuchsplans. */
      designLevels: (id) => _t(`designs.${  id  }.levels`),
      /** @noagent view transform: die Aufwandsangabe eines Versuchsplans. */
      designEffort: (id) => _t(`designs.${  id  }.effort`),
      /** @noagent view transform: die Anmerkung zu einem Versuchsplan. */
      designNote: (id) => _t(`designs.${  id  }.note`),

      // ─── Overview: phase guide cells ────────────────────────
      /** @noagent view transform: die Phasenbezeichnung der Phasenübersicht. */
      phasePhase: (id) => _t(`phaseGuide.${  id  }.phase`),
      /** @noagent view transform: das Ziel einer Phase. */
      phaseGoal: (id) => _t(`phaseGuide.${  id  }.goal`),
      /** @noagent view transform: die Versuchspläne, die zu einer Phase passen. */
      phaseDesigns: (id) => _t(`phaseGuide.${  id  }.designs`),

      // ─── CCD comparison cells ───────────────────────────────
      /** @noagent view transform: die Zeilenbeschriftung des Planvergleichs. */
      ccdLabel: (id) => _t(`ccd.rows.${  id  }.label`),
      /** @noagent view transform: der Wert der drehbaren Ausführung. */
      ccdRotatable: (id) => _t(`ccd.rows.${  id  }.rotatable`),
      /** @noagent view transform: der Wert der flächenzentrierten Ausführung. */
      ccdFace: (id) => _t(`ccd.rows.${  id  }.face`),

      // ─── Wizard: question + options (depend on current step) ─
      /** @noagent view transform: die Frage des offenen Schritts. */
      stepQuestion() {
        return _t(`wizard.${  this.model.currentStep  }.question`);
      },
      /** @noagent view transform: die Beschriftung einer Antwortmöglichkeit. */
      optionLabel(opt) {
        return _t(`wizard.${  this.model.currentStep  }.options.${  opt  }.label`);
      },
      /** @noagent view transform: die Erläuterung einer Antwortmöglichkeit. */
      optionHelp(opt) {
        return _t(`wizard.${  this.model.currentStep  }.options.${  opt  }.help`);
      },

      // ─── Wizard: answer trail ───────────────────────────────
      /** @noagent view transform: das Kürzel einer beantworteten Frage. */
      trailShort: (stepId) => _t(`wizard.${  stepId  }.short`),
      /** @noagent view transform: die gegebene Antwort einer beantworteten Frage. */
      trailAnswer(stepId) {
        const ans = this.model.answers[ANSWER_KEYS[stepId]];
        return _t(`wizard.${  stepId  }.options.${  ans  }.label`);
      },

      // ─── Wizard: progress label ─────────────────────────────
      /** @noagent view transform: die Fortschrittsanzeige des Beraters. */
      stepLabel() {
        if (this.model.isResult) return _t('wizardResultLabel');
        const current = this.model.history.length + 1;
        const total = Math.max(current + 1, 4);
        return _t('wizardStepOf', { current, total });
      },

      // ─── Wizard: result card ────────────────────────────────
      /**
       * @noagent view transform: die Empfehlung in Anzeigeform, aus denselben
       * Texten wie die Ergebniskarte; Anzeige und Lesefläche teilen sie.
       * @returns {Recommendation|null} null, solange kein Versuchsplan empfohlen ist
       */
      recommendation() {
        const designId = this.model.resultDesignId;
        if (designId === null) return null;
        return {
          designId,
          name: this.resultName(),
          factors: this.resultFactors(),
          levels: this.resultLevels(),
          effort: this.resultEffort(),
        };
      },
      /** @noagent view transform: die Bezeichnung des empfohlenen Versuchsplans. */
      resultName() {
        return _t(`designs.${  this.model.resultDesignId  }.name`);
      },
      /** @noagent view transform: die Begründung der Empfehlung. */
      resultReasoning() {
        return _t(`wizard.reasoning.${  this.model.resultDesignId}`);
      },
      /** @noagent view transform: der Einsatzhinweis des empfohlenen Versuchsplans. */
      resultTip() {
        return _t(`designs.${  this.model.resultDesignId  }.tip`);
      },
      /** @noagent view transform: die Anmerkung zum empfohlenen Versuchsplan. */
      resultNote() {
        return _t(`designs.${  this.model.resultDesignId  }.note`);
      },
      /** @noagent view transform: die Faktorenspanne des empfohlenen Versuchsplans. */
      resultFactors() {
        return _t(`designs.${  this.model.resultDesignId  }.factors`);
      },
      /** @noagent view transform: die Stufenangabe des empfohlenen Versuchsplans. */
      resultLevels() {
        return _t(`designs.${  this.model.resultDesignId  }.levels`);
      },
      /** @noagent view transform: die Aufwandsangabe des empfohlenen Versuchsplans. */
      resultEffort() {
        return _t(`designs.${  this.model.resultDesignId  }.effort`);
      },

      // ─── Event handlers ─────────────────────────────────────
      /**
       * Wechselt den angezeigten Bereich.
       * @agent
       * @param {'overview'|'wizard'|'ccd'} tab overview zeigt den Katalog,
       *   wizard den geführten Berater, ccd den Planvergleich. Jeder andere
       *   Wert ist ein Fehler.
       * @returns {void}
       * @throws {Error} wenn `tab` keiner dieser drei Bereiche ist
       */
      switchTab(tab) {
        requireEnum('tab', tab, TABS);
        this.model.tab = tab;
      },
      /**
       * Beantwortet die offene Frage und geht zur nächsten weiter — oder zur
       * Empfehlung, wenn der Weg dort endet.
       * @agent
       * @param {string} opt die gewählte Antwortmöglichkeit der OFFENEN
       *   Frage. Eine Möglichkeit, die diese Frage nicht kennt, ist ein
       *   Fehler; die Meldung nennt die zulässigen.
       * @returns {boolean} false, wenn keine Frage offen ist, weil der
       *   Berater schon auf seiner Empfehlung steht
       * @throws {Error} wenn die offene Frage diese Antwortmöglichkeit nicht
       *   führt
       */
      answer(opt) {
        const options = this.model.currentOptions;
        // Steht der Berater auf seiner Empfehlung, gibt es keine Frage und
        // keine Antwortmöglichkeiten mehr. Das ist eine fachliche Absage,
        // kein ungültiges Argument — und `requireEnum` gegen die leere Menge
        // meldete „allowed:" ohne einen einzigen Wert.
        if (options.length === 0) return false;
        requireEnum('opt', opt, options);
        this.model.answerStep(opt);
        return true;
      },
      /**
       * Geht eine Frage zurück und verwirft die Antwort, die weggeführt hat.
       * @agent
       * @returns {boolean} false, wenn der Berater auf der ersten Frage steht
       *   und es nichts zurückzugehen gibt
       */
      back() {
        if (this.model.history.length === 0) return false;
        this.model.goBack();
        return true;
      },
      /**
       * Beginnt den Berater neu: erste Frage, keine Antworten.
       * @agent
       * @returns {void}
       */
      restart() {
        this.model.resetWizard();
      },
    };
  },
});
