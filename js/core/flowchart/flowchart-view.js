/**
 * D.Mike — Flowchart chain view mixin (flowchart-view.js)
 *
 * data()-mixin for the four flowchart modules: shared step drag/drop and
 * textarea autosize. Spread into a module's data() to inherit consistent
 * chain interaction behavior. See spec §1 "Architektur".
 */

/**
 * @param {object|null} module   the createModule instance (reserved for future hooks)
 * @param {(key: string) => string} _t   i18n helper (reserved for future strings)
 * @param {{autoSizeSelector?: string}} [opts]
 * @returns {object} data()-mixin with transient drag state and handlers
 */
export function chainViewMixin(module, _t, opts = {}) {
  const autoSizeSelector = opts.autoSizeSelector
    || 'textarea[data-autosize], textarea.pmap__io-name, textarea.pmap__title, textarea.pmap__step-title';

  return {
    _draggedStepId: /** @type {string|null} */ (null),

    stepDragStart(stepId, event) {
      this._draggedStepId = stepId;
      if (event?.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', stepId); } catch (_) { /* ignore */ }
      }
      event?.target?.classList?.add('is-dragging');
    },

    stepDragOver(stepId, event) {
      if (!this._draggedStepId || this._draggedStepId === stepId) return;
      event?.preventDefault();
      if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
      event?.currentTarget?.classList?.add('is-drop-target');
    },

    stepDragLeave(_stepId, event) {
      event?.currentTarget?.classList?.remove('is-drop-target');
    },

    stepDrop(stepId, event) {
      event?.preventDefault();
      event?.currentTarget?.classList?.remove('is-drop-target');
      const from = this._draggedStepId;
      this._draggedStepId = null;
      if (!from || from === stepId) return;
      this.model?.moveStep?.(from, stepId);
    },

    stepDragEnd(event) {
      this._draggedStepId = null;
      event?.target?.classList?.remove('is-dragging');
    },

    autoSize(event) {
      const el = event?.target;
      if (!el || typeof el.scrollHeight !== 'number') return;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    },

    _autoSizeAll() {
      const root = this.$root || document;
      root.querySelectorAll(autoSizeSelector).forEach((el) => {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      });
    },
  };
}
