import { createDialog } from '../../core/create-dialog.js';
import { createScenarioModel } from './cycle-picker-model.js';

/**
 * Scenario radio options for a cycle: the empty project first, then every
 * scenario shipped for that cycle. Empty when `examplesRegistry` is absent
 * (e.g. the confirm-only cycle-switch dialog reuses nothing of this — the
 * cycle-picker itself always has one).
 * @param {{i18n: object, examplesRegistry: object}} deps
 * @returns {(cycleId: string) => {id:string,title:string,description:string}[]}
 */
function buildScenarioOptionsFor({ i18n, examplesRegistry }) {
  const lang = () => i18n.getLanguage();
  return (cycleId) => [
    { id: '', title: i18n.t('cycles.emptyProject'), description: '' },
    ...(examplesRegistry?.getScenarios({ cycle: cycleId }) ?? []).map(s => ({
      id: s.id,
      title: s.title?.[lang()] || s.title?.en || s.id,
      description: s.description?.[lang()] || s.description?.en || '',
    })),
  ];
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
    data: (t) => ({ scenarioLabel: t('scenarioSectionTitle') }),
  });
}
