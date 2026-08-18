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
 * Grow a textarea to exactly its content height.
 *
 * `scrollHeight` is the CONTENT height. Under `box-sizing: border-box` — which
 * the shared `.field` base sets — assigning it to `height` makes the border
 * eat into the content box and clips the last couple of pixels of the final
 * line. The borders are added back explicitly.
 *
 * @param {HTMLElement|undefined|null} el
 * @returns {void}
 */
function fitToContent(el) {
  if (!el || typeof el.scrollHeight !== 'number') return;
  el.style.height = 'auto';
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  const borders = cs && cs.boxSizing === 'border-box'
    ? (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
    : 0;
  el.style.height = (el.scrollHeight + borders) + 'px';
}

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
    /** @type {number|null} gap under the cursor while a card is in flight */
    _activeGap: null,

    stepDragStart(stepId, event) {
      this._draggedStepId = stepId;
      if (event?.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', stepId); } catch (_) { /* ignore */ }
      }
      event?.target?.classList?.add('is-dragging');
    },

    stepDragEnd(event) {
      this._draggedStepId = null;
      // An aborted drag must not leave an insert bar behind.
      this._activeGap = null;
      event?.target?.classList?.remove('is-dragging');
      // Disarm: the row is only draggable while a drag started from the number
      // badge is in flight, so text in the title/description stays selectable.
      event?.target?.closest?.(dragRowSelector)?.removeAttribute('draggable');
    },

    // ── Gap drops ─────────────────────────────────────────────────────
    // A chain of n steps has n+1 gaps (0…n); gap g is the chain position a
    // card dropped there takes. The arrows between the cards ARE those gaps,
    // so a drop says "the card goes here" and nothing else — in the swimlane
    // charts the area around a card already belongs to the band change.

    /** True while a card is in flight — gates the rails and their hit areas. */
    isDragging() {
      return this._draggedStepId !== null;
    },

    /**
     * Gap 0 sits in front of the first card. Only rendered during a drag —
     * otherwise every chain would start with an arrow pointing at nothing.
     * @param {number} idx 0-based index of the step the rail belongs to
     * @returns {boolean}
     */
    showStartRail(idx) {
      return idx === 0 && this._draggedStepId !== null;
    },

    /**
     * Gap n hangs off the last card. Same drag-only rule as showStartRail.
     * @param {number} idx 0-based index of the step the rail belongs to
     * @returns {boolean}
     */
    showEndRail(idx) {
      return idx === (this.model?.steps?.length || 0) - 1 && this._draggedStepId !== null;
    },

    /**
     * @param {number} g gap index
     * @returns {boolean} true when the cursor currently sits over gap g
     */
    isGapActive(g) {
      return this._activeGap === g;
    },

    /**
     * Transient classes for the connector at gap `g`: the enlarged hit area
     * while a card is in flight, plus the insert bar for the gap under the
     * cursor. Assembled here rather than in the template — Alpine CSP wants
     * one plain method call per binding (.claude/alpine.md).
     * @param {number} g gap index
     * @returns {string}
     */
    gapClass(g) {
      if (this._draggedStepId === null) return '';
      return this.isGapActive(g) ? 'fc-connector--drop is-drop-target' : 'fc-connector--drop';
    },

    gapDragOver(g, event) {
      // Without a card in flight the connector stays a plain insert button —
      // preventDefault() here would make it a drop target for anything.
      if (this._draggedStepId === null) return;
      event?.preventDefault();
      if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
      this._activeGap = g;
    },

    gapDragLeave(g, _event) {
      // Only clear OUR gap: dragover on the next connector may already have
      // claimed _activeGap before this leave fires.
      if (this._activeGap === g) this._activeGap = null;
    },

    gapDrop(g, event) {
      event?.preventDefault();
      const from = this._draggedStepId;
      this._draggedStepId = null;
      this._activeGap = null;
      if (!from) return;
      this.model?.moveStepToGap?.(from, g);
    },

    // The gap BEHIND step `idx` is gap idx + 1. It gets its own methods
    // instead of `gapDrop(idx + 1, $event)` in the template: Alpine CSP event
    // expressions are plain method calls, and arithmetic in an argument is
    // not worth the risk (.claude/alpine.md, "Event-Expression: Nur
    // Methodenaufrufe"). Used by every trailing arrow and every end rail.
    gapDragOverAfter(idx, event) { this.gapDragOver(idx + 1, event); },
    gapDragLeaveAfter(idx, event) { this.gapDragLeave(idx + 1, event); },
    gapDropAfter(idx, event) { this.gapDrop(idx + 1, event); },
    gapClassAfter(idx) { return this.gapClass(idx + 1); },

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
      fitToContent(event?.target);
    },

    _autoSizeAll() {
      const root = this.$root || document;
      root.querySelectorAll(autoSizeSelector).forEach(fitToContent);
    },
  };
}
