/**
 * Ishikawa 6M — Problem tab rendering & events.
 */

export const problemMethods = {
  _renderProblemTab(t) {
    return `
      <div class="ishikawa__problem-tab">
        <div class="ishikawa__problem-statement">
          <label class="ishikawa__panel-label">${t('problemStatement')}</label>
          <textarea class="ishikawa__problem-textarea" data-ref="problemInput"
                    rows="3" placeholder="${t('problemPlaceholder')}">${this._escapeHtml(this._problem)}</textarea>
        </div>

        ${this._renderImageGallery('inScope', t)}
        ${this._renderImageGallery('outScope', t)}
      </div>
    `;
  },

  _renderImageGallery(kind, t) {
    const images = this._images[kind] || [];
    const isIn = kind === 'inScope';
    const modifier = isIn ? 'in' : 'out';
    const titleKey = isIn ? 'problemScopeInLabel' : 'problemScopeOutLabel';
    const hintKey = isIn ? 'problemScopeInHint' : 'problemScopeOutHint';
    const uploadId = `ishikawa-img-upload-${kind}`;

    const cards = images.length
      ? images.map(img => `
          <figure class="ishikawa__img-card" data-img-id="${img.id}" data-img-kind="${kind}">
            <button class="ishikawa__img-thumb" type="button" data-img-open="${img.id}" data-img-kind="${kind}"
                    aria-label="${t('openImage')}">
              <img src="${img.dataUrl}" alt="${this._escapeAttr(img.caption || '')}" />
            </button>
            <input type="text" class="ishikawa__img-caption" value="${this._escapeAttr(img.caption || '')}"
                   placeholder="${t('captionPlaceholder')}" data-img-caption="${img.id}" data-img-kind="${kind}" />
            <div class="ishikawa__img-meta">
              <span class="ishikawa__img-size">${this._formatImgSize(img.dataUrl)}</span>
              <button class="ishikawa__img-del" type="button" data-img-del="${img.id}" data-img-kind="${kind}"
                      title="${this._context.i18n.t('common.delete')}">&#x2715;</button>
            </div>
          </figure>`).join('')
      : `<div class="ishikawa__img-empty">${t('noImages')}</div>`;

    return `
      <div class="ishikawa__img-gallery ishikawa__img-gallery--${modifier}">
        <div class="ishikawa__img-gallery-header">
          <div>
            <label class="ishikawa__panel-label">${t(titleKey)}</label>
            <p class="ishikawa__img-hint">${t(hintKey)}</p>
          </div>
          <label class="btn btn--sm btn--primary ishikawa__img-upload-btn" for="${uploadId}">
            + ${t('uploadImages')}
          </label>
          <input type="file" id="${uploadId}" class="ishikawa__img-upload-input"
                 accept="image/*" multiple data-img-upload="${kind}" />
        </div>
        <div class="ishikawa__img-grid">${cards}</div>
      </div>
    `;
  },

  _bindProblemEvents(t) {
    const el = this._container;

    // Problem statement textarea
    const probInp = el.querySelector('[data-ref="problemInput"]');
    if (probInp) {
      probInp.addEventListener('input', () => { this._problem = probInp.value; this._save(); });
    }

    // File uploads
    el.querySelectorAll('[data-img-upload]').forEach(inp => {
      inp.addEventListener('change', async () => {
        const kind = inp.dataset.imgUpload;
        const files = Array.from(inp.files || []);
        if (!files.length) return;

        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          try {
            const { dataUrl, bytes } = await this._compressImage(file, 100 * 1024);
            this._images[kind].push({
              id: this._imgUid(),
              dataUrl,
              caption: '',
            });
            if (bytes > 100 * 1024) {
              this._context.notify(t('imageTooLarge', { name: file.name }));
            }
          } catch (err) {
            console.error('Image compression failed', err);
            this._context.notify(t('imageLoadFailed', { name: file.name }));
          }
        }
        inp.value = '';
        this._save();
        this._render();
      });
    });

    // Caption edit
    el.querySelectorAll('[data-img-caption]').forEach(inp => {
      inp.addEventListener('input', () => {
        const kind = inp.dataset.imgKind;
        const id = parseInt(inp.dataset.imgCaption, 10);
        const img = (this._images[kind] || []).find(x => x.id === id);
        if (img) { img.caption = inp.value; this._save(); }
      });
    });

    // Open image lightbox
    el.querySelectorAll('[data-img-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.imgKind;
        const id = parseInt(btn.dataset.imgOpen, 10);
        const img = (this._images[kind] || []).find(x => x.id === id);
        if (img) this._openImageLightbox(img, t);
      });
    });

    // Delete image
    el.querySelectorAll('[data-img-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const kind = btn.dataset.imgKind;
        const id = parseInt(btn.dataset.imgDel, 10);
        const img = (this._images[kind] || []).find(x => x.id === id);
        if (!img) return;
        const label = (img.caption && img.caption.trim()) || `#${this._images[kind].indexOf(img) + 1}`;
        const ok = await this._context.showModal.confirm(
          t('delImageConfirm', { name: label }),
          {
            title: this._context.i18n.t('common.delete'),
            confirmLabel: this._context.i18n.t('common.delete'),
            danger: true,
          }
        );
        if (!ok) return;
        this._images[kind] = this._images[kind].filter(x => x.id !== id);
        this._save();
        this._render();
      });
    });
  },

  _openImageLightbox(img, t) {
    const content = document.createElement('div');
    content.className = 'ishikawa__img-lightbox';
    content.innerHTML = `
      <img src="${img.dataUrl}" alt="${this._escapeAttr(img.caption || '')}" />
      ${img.caption ? `<p class="ishikawa__img-lightbox-caption">${this._escapeHtml(img.caption)}</p>` : ''}
    `;
    this._context.showModal.show(t('openImage'), content, { wide: true });
  },

  /**
   * Compress an image file below maxBytes using canvas JPEG re-encoding.
   * Iteratively lowers quality, then dimensions, until the target is reached
   * or the minimum dimension (320px) is hit.
   * @param {File} file
   * @param {number} maxBytes
   * @returns {Promise<{ dataUrl: string, bytes: number }>}
   */
  async _compressImage(file, maxBytes) {
    const srcUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = srcUrl;
      });

      let maxDim = Math.max(img.naturalWidth, img.naturalHeight);
      let targetDim = Math.min(maxDim, 1600);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const encode = (dim, quality) => {
        const ratio = dim / maxDim;
        canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const bytes = Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
        return { dataUrl, bytes };
      };

      let best = encode(targetDim, 0.85);
      const qualitySteps = [0.75, 0.65, 0.55, 0.45, 0.35];
      let qi = 0;
      while (best.bytes > maxBytes) {
        if (qi < qualitySteps.length) {
          best = encode(targetDim, qualitySteps[qi]);
          qi++;
        } else if (targetDim > 320) {
          targetDim = Math.max(320, Math.round(targetDim * 0.75));
          qi = 0;
          best = encode(targetDim, 0.85);
        } else {
          break;
        }
      }
      return best;
    } finally {
      URL.revokeObjectURL(srcUrl);
    }
  },

  _formatImgSize(dataUrl) {
    const bytes = Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  },
};
