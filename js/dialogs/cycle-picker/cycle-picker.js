import { createDialog } from '../../core/create-dialog.js';
import { Model } from './cycle-picker-model.js';

/** Build the cycle-picker dialog. @param {{i18n,eventBus}} ctx */
export function buildCyclePickerDialog(ctx) {
  return createDialog({
    id: 'cycle-picker',
    i18nKey: 'cycles',
    titleKey: 'pickerTitle',
    Model,
    ctx,
  });
}
