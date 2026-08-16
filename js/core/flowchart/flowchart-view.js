/**
 * D.Mike — Flowchart chain view mixin (flowchart-view.js)
 *
 * data()-mixin for the four flowchart modules: shared step drag/drop, the
 * sequence badge, substep interaction and textarea autosize. Spread into a
 * module's data() to inherit consistent chain interaction behavior. Modules
 * that need to do more on an action (Process Map redraws its loop brackets)
 * override the method after the spread — plain object-literal precedence.
 * See spec §1 "Architektur".
 */

/**
 * @param {object|null} module   the createModule instance (reserved for future hooks)
 * @param {(key: string) => string} _t   i18n helper
 * @param {{
 *   autoSizeSelector?: string,
 *   dragRowSelector?: string,    // element that carries `draggable`, armed by armStepDrag
 *   substepItemSelector?: string // element that carries `draggable` for a substep
 * }} [opts]
 * @returns {object} data()-mixin with transient drag state and handlers
 */
/**
 * Fields every flowchart card has. They are ALWAYS auto-sized, on top of
 * whatever a module adds via `opts.autoSizeSelector`: a card body must show
 * its whole text, otherwise a long description is silently clipped and the
 * reader has no cue that more is there.
 */
const CORE_AUTOSIZE = 'textarea.fc-card__title, textarea.fc-card__description';

export function chainViewMixin(module, _t, opts = {}) {
  const autoSizeSelector = [CORE_AUTOSIZE, opts.autoSizeSelector]
    .filter(Boolean).join(', ');
  const dragRowSelector = opts.dragRowSelector || '[data-step-id]';
  const substepItemSelector = opts.substepItemSelector || '[data-substep-id]';

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

    /**
     * Sequence label for a step, zero-padded to two digits ("01", "02", …) so
     * a chain of cards keeps a stable badge width. Shared by all four
     * flowchart modules — Process Map set the format, the others follow it.
     * @param {number} idx 0-based index in the chain
     * @returns {string}
     */
    stepNum(idx) {
      return String(idx + 1).padStart(2, '0');
    },

    /**
     * Arm a step for dragging. Modules that make a row draggable only while
     * the number badge is held (so a click in the title never starts a drag)
     * call this from the badge's mousedown.
     * @param {string} _stepId  unused — kept so templates read symmetrically
     * @param {Event} event
     * @returns {void}
     */
    armStepDrag(_stepId, event) {
      const row = event?.target?.closest?.(dragRowSelector);
      if (row) row.setAttribute('draggable', 'true');
    },

    // ── Substeps ──────────────────────────────────────────────────────
    _draggedSubId: /** @type {string|null} */ (null),
    _draggedParentId: /** @type {string|null} */ (null),

    /**
     * Hierarchical label for a substep, e.g. "2.3".
     * @param {number} parentIdx 0-based index of the parent step
     * @param {number} subIdx 0-based index of the substep
     * @returns {string}
     */
    substepNum(parentIdx, subIdx) {
      return `${parentIdx + 1}.${subIdx + 1}`;
    },

    /**
     * Label for the substeps disclosure bar, with the count when non-empty.
     * @param {object} step
     * @returns {string}
     */
    substepsBarLabel(step) {
      const n = step?.substeps?.length || 0;
      return _t('substepsLabel') + (n > 0 ? ` (${n})` : '');
    },

    toggleSubsteps(stepId) { this.model?.toggleSubsteps?.(stepId); },
    addSubstep(stepId) { this.model?.addSubstep?.(stepId); },
    removeSubstep(parentId, substepId) { this.model?.removeSubstep?.(parentId, substepId); },

    armSubDrag(event) {
      const item = event?.target?.closest?.(substepItemSelector);
      if (item) item.setAttribute('draggable', 'true');
    },

    subDragStart(parentId, subId, event) {
      event?.stopPropagation();
      this._draggedSubId = subId;
      this._draggedParentId = parentId;
      if (event?.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      const item = event?.target?.closest?.(substepItemSelector);
      // Deferred a tick: a class set synchronously in dragstart is picked up
      // for the drag image, which would render the ghost half-transparent.
      setTimeout(() => item?.classList.add('is-dragging'), 0);
    },

    subDragOver(parentId, subId, event) {
      event?.preventDefault();
      event?.stopPropagation();
      if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
      // Reordering is scoped to one parent — no cross-step substep moves.
      if (subId !== this._draggedSubId && parentId === this._draggedParentId) {
        event?.currentTarget?.classList?.add('is-drop-target');
      }
    },

    subDragLeave(_subId, event) {
      const item = event?.currentTarget;
      if (item && !item.contains(event.relatedTarget)) {
        item.classList.remove('is-drop-target');
      }
    },

    subDrop(parentId, subId, event) {
      event?.preventDefault();
      event?.stopPropagation();
      const from = this._draggedSubId;
      const fromParent = this._draggedParentId;
      this._draggedSubId = null;
      this._draggedParentId = null;
      event?.currentTarget?.classList?.remove('is-drop-target');
      if (!from || from === subId || parentId !== fromParent) return;
      this.model?.moveSubstep?.(parentId, from, subId);
    },

    subDragEnd(event) {
      const item = event?.target?.closest?.(substepItemSelector);
      item?.removeAttribute('draggable');
      item?.classList?.remove('is-dragging');
      this._draggedSubId = null;
      this._draggedParentId = null;
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
