/**
 * D.Mike — DoE-Berater Module (doe-advisor.js)
 * Overview of available DoE designs and a guided wizard that recommends
 * the right design based on the user's project context.
 * DMAIC phase: Improve
 *
 * State + wizard decision tree live in doe-advisor-model.js; this file is the
 * view layer (i18n formatting + event handlers) wired up via createModule.
 */

import { createModule } from '../../core/template-module.js';
import {
  State,
  DESIGN_IDS,
  PHASE_GUIDE_IDS,
  CCD_ROW_IDS,
  ANSWER_KEYS,
} from './doe-advisor-model.js';

export default createModule({
  config: {
    id: 'doe-advisor',
    engine: 'alpine',
    phase: 'improve',
    icon: 'compass',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ─── Static id lists (iterated by x-for) ────────────────
      designIds: DESIGN_IDS,
      phaseGuideIds: PHASE_GUIDE_IDS,
      ccdRowIds: CCD_ROW_IDS,

      // ─── Overview: design catalog cells ─────────────────────
      designName: (id) => _t(`designs.${  id  }.name`),
      designTip: (id) => _t(`designs.${  id  }.tip`),
      designFactors: (id) => _t(`designs.${  id  }.factors`),
      designLevels: (id) => _t(`designs.${  id  }.levels`),
      designEffort: (id) => _t(`designs.${  id  }.effort`),
      designNote: (id) => _t(`designs.${  id  }.note`),

      // ─── Overview: phase guide cells ────────────────────────
      phasePhase: (id) => _t(`phaseGuide.${  id  }.phase`),
      phaseGoal: (id) => _t(`phaseGuide.${  id  }.goal`),
      phaseDesigns: (id) => _t(`phaseGuide.${  id  }.designs`),

      // ─── CCD comparison cells ───────────────────────────────
      ccdLabel: (id) => _t(`ccd.rows.${  id  }.label`),
      ccdRotatable: (id) => _t(`ccd.rows.${  id  }.rotatable`),
      ccdFace: (id) => _t(`ccd.rows.${  id  }.face`),

      // ─── Wizard: question + options (depend on current step) ─
      stepQuestion() {
        return _t(`wizard.${  this.model.currentStep  }.question`);
      },
      optionLabel(opt) {
        return _t(`wizard.${  this.model.currentStep  }.options.${  opt  }.label`);
      },
      optionHelp(opt) {
        return _t(`wizard.${  this.model.currentStep  }.options.${  opt  }.help`);
      },

      // ─── Wizard: answer trail ───────────────────────────────
      trailShort: (stepId) => _t(`wizard.${  stepId  }.short`),
      trailAnswer(stepId) {
        const ans = this.model.answers[ANSWER_KEYS[stepId]];
        return _t(`wizard.${  stepId  }.options.${  ans  }.label`);
      },

      // ─── Wizard: progress label ─────────────────────────────
      stepLabel() {
        if (this.model.isResult) return _t('wizardResultLabel');
        const current = this.model.history.length + 1;
        const total = Math.max(current + 1, 4);
        return _t('wizardStepOf', { current, total });
      },

      // ─── Wizard: result card ────────────────────────────────
      resultName() {
        return _t(`designs.${  this.model.resultDesignId  }.name`);
      },
      resultReasoning() {
        return _t(`wizard.reasoning.${  this.model.resultDesignId}`);
      },
      resultTip() {
        return _t(`designs.${  this.model.resultDesignId  }.tip`);
      },
      resultNote() {
        return _t(`designs.${  this.model.resultDesignId  }.note`);
      },
      resultFactors() {
        return _t(`designs.${  this.model.resultDesignId  }.factors`);
      },
      resultLevels() {
        return _t(`designs.${  this.model.resultDesignId  }.levels`);
      },
      resultEffort() {
        return _t(`designs.${  this.model.resultDesignId  }.effort`);
      },

      // ─── Event handlers ─────────────────────────────────────
      switchTab(tab) {
        this.model.tab = tab;
      },
      answer(opt) {
        this.model.answerStep(opt);
      },
      back() {
        this.model.goBack();
      },
      restart() {
        this.model.resetWizard();
      },
    };
  },
});
