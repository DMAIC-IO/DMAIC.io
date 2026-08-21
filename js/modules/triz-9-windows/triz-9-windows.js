import { createModule } from '../../core/template-module.js';
import { State } from './triz-9-windows-model.js';
import { readImageFile, IMAGE_UPLOAD_ERRORS } from '../../core/image-upload.js';

export default createModule({
  config: {
    id: 'triz-9-windows',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-9-windows',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,
  data(module, _t) {
    return {
      enlarged: null,

      colPlaceholder(c) {
        return [_t('colPast'), _t('colPresent'), _t('colFuture')][c];
      },

      rowPlaceholder(r) {
        return [_t('rowSub'), _t('rowSys'), _t('rowSuper')][r];
      },

      axisColsText() {
        return `${_t('axisCols')  } \u2192`;
      },

      colAxisAria(c) {
        return _t('colAxisAria', { idx: c + 1 });
      },

      rowAxisAria(r) {
        return _t('rowAxisAria', { idx: r + 1 });
      },

      coordText(r, c) {
        const rowDef = [_t('rowSub'), _t('rowSys'), _t('rowSuper')];
        const colDef = [_t('colPast'), _t('colPresent'), _t('colFuture')];
        const rowLbl = this.model.rows[r].rowLabel.val || rowDef[r];
        const colLbl = this.model.colLabels[c].val || colDef[c];
        return `${rowLbl  } \u00b7 ${  colLbl}`;
      },

      imageAlt(r, c) {
        const rowDef = [_t('rowSub'), _t('rowSys'), _t('rowSuper')];
        const colDef = [_t('colPast'), _t('colPresent'), _t('colFuture')];
        const rowLbl = this.model.rows[r].rowLabel.val || rowDef[r];
        const colLbl = this.model.colLabels[c].val || colDef[c];
        return _t('imageAlt', { row: rowLbl, col: colLbl });
      },

      enlargedImageSrc() {
        const e = this.enlarged;
        return e ? this.model.rows[e.r].cells[e.c].image : null;
      },

      uploadBtnStyle(cell) {
        return cell.image ? 'display:none' : '';
      },

      async handleImageUpload(r, c, event) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const dataUrl = await readImageFile(file);
          this.model.rows[r].cells[c].image = dataUrl;
        } catch (err) {
          const msgs = {
            [IMAGE_UPLOAD_ERRORS.INVALID_TYPE]: _t('imageTypeError'),
            [IMAGE_UPLOAD_ERRORS.FILE_TOO_LARGE]: _t('imageTooLarge'),
            [IMAGE_UPLOAD_ERRORS.READ_ERROR]: _t('imageReadError'),
          };
          module._context.notify?.({ type: 'error', message: msgs[err.message] || err.message });
          event.target.value = '';
        }
      },

      clearImage(r, c) {
        this.model.clearCellImage(r, c);
      },

      enlarge(r, c) {
        this.enlarged = { r, c };
      },

      closeEnlarged(event) {
        if (event.target.classList.contains('triz-9w__overlay-img')) return;
        this.enlarged = null;
      },
    };
  },
});
