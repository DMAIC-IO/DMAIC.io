/**
 * D.Mike — Ishikawa problem (viewmodel/problem.js)
 *
 * Sub-viewmodel of the problem tab: problem statement, the in-scope and
 * out-of-scope image galleries and the image lightbox. Knows the model, the
 * pure ishikawa-*.js helpers and core modules — never a sibling or the shell
 * (spec E2). Images stay with the interface: the agent reads their size and
 * caption, it neither uploads nor deletes them (spec E5).
 *
 * Spec: docs/superpowers/specs/2026-10-25-ishikawa-agent-release-design.md
 */

import { compressImageToBudget } from '../../../core/image-upload.js';
import { requireText } from '../../../core/agent/agent-argcheck.js';

/** Upload budget per image (bytes). */
const IMAGE_BUDGET = 100 * 1024;

export class ProblemViewModel {
  /**
   * Gets only what exists before the mount; the model comes with attach().
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    /** @type {{src: string, caption: string}} the image shown in the lightbox */
    this.lightbox = { src: '', caption: '' };
    this._ref = () => null;
  }

  /**
   * Binds the component's model and the template refs (spec E3).
   * @noagent lifecycle
   * @param {{model: object, events: object, watch: function, nextTick: function, ref: function(string): ?Element}} binding
   */
  attach({ model, ref }) {
    this.model = model;
    this._ref = ref;
  }

  /**
   * Nothing to release but the template-ref lookup: no listeners, timers or charts.
   * @noagent lifecycle
   */
  detach() { this._ref = () => null; }

  /**
   * Set the problem statement every cause refers to.
   * @agent
   * @param {string} text the statement; "" clears it
   * @returns {void}
   * @throws {Error} if `text` is not a string
   */
  setProblem(text) {
    this.model.problem = requireText('text', text);
  }

  /** @noagent view transform @param {'inScope'|'outScope'} kind @returns {string} BEM modifier */
  galleryModifier(kind) { return kind === 'inScope' ? 'in' : 'out'; }

  /** @noagent view transform @param {'inScope'|'outScope'} kind @returns {string} gallery title */
  galleryLabel(kind) { return this._t(kind === 'inScope' ? 'problemScopeInLabel' : 'problemScopeOutLabel'); }

  /** @noagent view transform @param {'inScope'|'outScope'} kind @returns {string} gallery hint */
  galleryHint(kind) { return this._t(kind === 'inScope' ? 'problemScopeInHint' : 'problemScopeOutHint'); }

  /**
   * @noagent view transform
   * @param {string} dataUrl base64 image
   * @returns {string} decoded size, "812 B" or "42 KB"
   */
  formatImgSize(dataUrl) {
    const bytes = Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  /**
   * @noagent file picker — the agent does not upload images (spec E5)
   * @param {'inScope'|'outScope'} kind gallery
   * @param {Event} $event change event of the file input
   * @returns {Promise<void>}
   */
  async uploadImages(kind, $event) {
    const inp = $event.target;
    const files = Array.from(inp.files || []);
    if (!files.length) return;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const { dataUrl, bytes } = await compressImageToBudget(file, { maxBytes: IMAGE_BUDGET });
        this.model.addImage(kind, dataUrl, '');
        if (bytes > IMAGE_BUDGET) this._context.notify?.(this._t('imageTooLarge', { name: file.name }));
      } catch (err) {
        console.error('Image compression failed', err);
        this._context.notify?.(this._t('imageLoadFailed', { name: file.name }));
      }
    }
    inp.value = '';
  }

  /**
   * Shows an image enlarged: fills the lightbox draft and lends the
   * template's lightbox node to the shared dialog, which returns it on close.
   * @noagent view only
   * @param {'inScope'|'outScope'} kind gallery
   * @param {number} id image id
   */
  openImage(kind, id) {
    const img = (this.model.images[kind] || []).find(x => x.id === id);
    if (!img) return;
    this.lightbox = { src: img.dataUrl, caption: img.caption || '' };
    const content = this._ref('lightbox');
    if (!content) return;
    this._context.dialog.show({ title: this._t('openImage'), content, size: 'wide' });
  }

  /**
   * @noagent asks first — the agent does not delete images (spec E5)
   * @param {'inScope'|'outScope'} kind gallery
   * @param {number} id image id
   * @returns {Promise<void>}
   */
  async deleteImage(kind, id) {
    const list = this.model.images[kind] || [];
    const img = list.find(x => x.id === id);
    if (!img) return;
    const label = (img.caption && img.caption.trim()) || `#${list.indexOf(img) + 1}`;
    const ok = await this._context.dialog.confirm({
      message: this._t('delImageConfirm', { name: label }),
      title: this._context.i18n.t('common.delete'),
      confirmLabel: this._context.i18n.t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    this.model.removeImage(kind, id);
  }
}
