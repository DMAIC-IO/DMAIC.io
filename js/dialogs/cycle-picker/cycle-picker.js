import { createDialog } from '../../core/create-dialog.js';
import { createScenarioModel } from './cycle-picker-model.js';

/**
 * Scenario rows for a cycle: every scenario shipped for that cycle, and
 * nothing else. The "empty project" choice is NOT part of this list — it is
 * its own step-2 row (with the project-name field) in the template, so a
 * synthetic `{ id: '' }` entry here would render a second, name-less copy of
 * it. Empty when `examplesRegistry` is absent.
 * @param {{i18n: object, examplesRegistry: object}} deps
 * @returns {(cycleId: string) => {id:string,title:string,description:string}[]}
 */
function buildScenarioOptionsFor({ i18n, examplesRegistry }) {
  const lang = () => i18n.getLanguage();
  return (cycleId) => (examplesRegistry?.getScenarios({ cycle: cycleId }) ?? []).map(s => ({
    id: s.id,
    title: s.title?.[lang()] || s.title?.en || s.id,
    description: s.description?.[lang()] || s.description?.en || '',
  }));
}

/** Build the cycle-picker dialog. @param {{i18n, eventBus, examplesRegistry}} ctx */
export function buildCyclePickerDialog(ctx) {
  const { i18n, eventBus, examplesRegistry } = ctx;
  const scenarioOptionsFor = buildScenarioOptionsFor({ i18n, examplesRegistry });
  return createDialog({
    id: 'cycle-picker',
    i18nKey: 'cycles',
    titleKey: 'pickerTitle',
    Model: createScenarioModel(scenarioOptionsFor),
    ctx: { i18n, eventBus },
    data: (t, dialog) => ({
      // Step-2 heading: the section now covers BOTH the empty project and the
      // scenarios, hence `startTitle` rather than the old scenario-only key.
      startLabel: t('startTitle'),
      emptyLabel: t('emptyProject'),
      createEmptyLabel: t('createEmpty'),
      loadLabel: t('loadScenario'),
      nextLabel: i18n.t('common.next'),
      backLabel: i18n.t('common.back'),
      nameLabel: i18n.t('app.projectName'),
      /** Step 1 → step 2, or immediate confirm in the switch context. */
      chooseCycle(id) { if (this.model.chooseCycle(id)) dialog.submit(); },
      /** Step 2 → step 1, keeping the picked cycle. */
      back() { this.model.back(); },
      /** Empty-project row: no scenario, the typed name wins. */
      createEmpty() { this.model.pickScenario(null); dialog.submit(); },
      /** Scenario row: the scenario supplies its own project name. */
      loadScenario(id) { this.model.pickScenario(id); dialog.submit(); },
    }),
  });
}
