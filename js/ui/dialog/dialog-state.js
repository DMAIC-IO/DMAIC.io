/**
 * D.Mike — Dialog display state (ui/dialog/dialog-state.js)
 * Turns the options of one dialog-service call into the plain data the shell
 * template renders: translated title and labels, which buttons exist, size,
 * dismissibility. No DOM, no functions — unit-testable on its own.
 */

/** Window widths in px per size name. */
export const DIALOG_SIZES = Object.freeze({ compact: 380, default: 520, wide: 800 });

const DEFAULT_SIZE = { confirm: 'compact', alert: 'compact', form: 'default', show: 'default', progress: 'default' };
const DEFAULT_TITLE = { confirm: 'common.confirm', alert: 'common.ok' };
const CONFIRM_LABEL = { confirm: 'common.yes', alert: 'common.ok', form: 'common.save' };

/**
 * Builds the display state for one dialog call.
 * @param {'confirm'|'alert'|'form'|'show'|'progress'} variant
 * @param {object} [opts]  the caller's options object (see dialog.js)
 * @param {(key: string) => string} t  i18n.t
 * @returns {object} plain display state
 */
export function buildDialogState(variant, opts = {}, t) {
  const isForm = variant === 'form';
  const hasConfirm = variant === 'confirm' || variant === 'alert' || (isForm && opts.hideConfirm !== true);
  const hasCancel = variant === 'confirm' || isForm;
  const hasDelete = isForm && typeof opts.onDelete === 'function';
  const size = Object.hasOwn(DIALOG_SIZES, opts.size || '') ? opts.size : DEFAULT_SIZE[variant];
  const titleKey = DEFAULT_TITLE[variant];
  return {
    variant,
    title: opts.title ?? (titleKey ? t(titleKey) : ''),
    message: opts.message ?? '',
    size,
    width: DIALOG_SIZES[size],
    dismissible: variant !== 'progress' && opts.dismissible !== false,
    confirmClass: variant === 'confirm' && opts.danger === true ? 'btn--danger' : 'btn--primary',
    confirmLabel: opts.confirmLabel ?? (CONFIRM_LABEL[variant] ? t(CONFIRM_LABEL[variant]) : ''),
    cancelLabel: opts.cancelLabel ?? t('common.cancel'),
    deleteLabel: opts.deleteLabel ?? t('common.delete'),
    hasConfirm,
    hasCancel,
    hasDelete,
    hasFooter: hasConfirm || hasCancel || hasDelete || isForm,
    closeLabel: t('common.close'),
    progressLabel: t('actions.modalLabel'),
  };
}
