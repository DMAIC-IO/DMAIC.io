import { createDialog } from '../../core/create-dialog.js';
import { Model } from './cross-version-import-model.js';
import { VERSION } from '../../core/version.js';

/** Build the cross-version-import dialog. @param {{i18n,eventBus}} ctx */
export function buildCrossVersionImportDialog(ctx) {
  return createDialog({
    id: 'cross-version-import',
    i18nKey: 'crossVersion',
    titleKey: 'title',
    Model,
    ctx,
    data: () => ({ currentVersion: VERSION }),
  });
}
