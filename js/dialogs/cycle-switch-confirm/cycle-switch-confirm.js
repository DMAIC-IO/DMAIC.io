import { createDialog } from '../../core/create-dialog.js';
import { Model } from './cycle-switch-confirm-model.js';

/** Build the cycle-switch-confirm dialog. @param {{i18n,eventBus}} ctx */
export function buildCycleSwitchConfirmDialog(ctx) {
  return createDialog({
    id: 'cycle-switch-confirm',
    i18nKey: 'cycles',
    titleKey: 'switchTitle',  // overridden per-open (dynamic from/to)
    Model,
    ctx,
    // Line helpers return '' when the section does not apply, so each <p> is
    // bound via x-text (no rAF-gated x-show) — content reflects immediately on
    // the reactive pass and innerText reads are stable for the UI/E2E.
    data: (t) => ({
      lostLine() {
        return this.model.lostPhasesText
          ? t('switchLostPhases', { phases: this.model.lostPhasesText }) : '';
      },
      newAddedLine() {
        return this.model.newAddedText
          ? t('switchNewPhases', { phases: this.model.newAddedText }) : '';
      },
      mappedLine() {
        return this.model.mapped > 0
          ? t('switchModuleMappedCount', { count: this.model.mapped }) : '';
      },
      fallbackLine() {
        return this.model.fallback > 0
          ? t('switchModuleFallbackCount', {
            count: this.model.fallback, phase: this.model.firstNewPhaseLabel,
          }) : '';
      },
    }),
  });
}
