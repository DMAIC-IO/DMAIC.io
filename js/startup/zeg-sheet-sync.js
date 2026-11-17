/**
 * D.Mike — ZEG sheet sync startup concern.
 * Installs the two-way sync between phaseAchievementHistory and the ZEG
 * worksheet (core/zeg-sheet/zeg-sheet.js) for the app lifetime.
 */
import { createStartup } from '../core/create-startup.js';
import { installZegSheetSync } from '../core/zeg-sheet/zeg-sheet.js';

export default createStartup({
  id: 'zeg-sheet-sync',

  run({ stateManager, eventBus, i18n }) {
    installZegSheetSync({ stateManager, eventBus, i18n });
  },
});
