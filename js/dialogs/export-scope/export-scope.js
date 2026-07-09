import { createDialog } from '../../core/create-dialog.js';
import { Model } from './export-scope-model.js';

/** Build the export-scope dialog. @param {{i18n,eventBus}} ctx */
export function buildExportScopeDialog(ctx) {
  return createDialog({
    id: 'export-scope',
    i18nKey: 'app',
    titleKey: 'export',
    Model,
    ctx,
  });
}
