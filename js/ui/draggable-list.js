/**
 * Alpine data-mixin for HTML5 drag-and-drop **reordering** of items that live
 * inside one or more grouped lists rendered by a module's Alpine template.
 *
 * Like draggable-popout.js, the markup stays in the template: the module binds
 * the handlers below on its draggable rows (`@dragstart`/`@dragend`) and on each
 * list container (`@dragover`/`@dragleave`/`@drop`). The mixin owns only the
 * transient drag state (which item is being dragged, which group is the current
 * drop target) and computes the drop index from the pointer position. It is
 * **model-agnostic** — the consumer supplies an `onReorder` callback that
 * performs the actual move on its own model.
 *
 * Each list is identified by a `group` key (a column key, a phase id, …). An
 * item is identified by `{ group, index }`. Reordering within a group and moving
 * across groups both go through the same `onReorder` call.
 *
 * Template contract:
 * ```html
 * <!-- one list per group -->
 * <div class="my-list"
 *      @dragover="dragOver(groupKey, $event)"
 *      @dragleave="dragLeave(groupKey, $event)"
 *      @drop="drop(groupKey, $event)">
 *   <template x-for="(item, i) in items">
 *     <div class="my-item" draggable="true"
 *          @dragstart="dragStart(groupKey, i, $event)"
 *          @dragend="dragEnd($event)">…</div>
 *   </template>
 * </div>
 * ```
 *
 * Use `isDragOver(group)` (boolean) to drive a drop-target highlight class on
 * the list/column wrapper.
 *
 * @param {object} options
 * @param {(move: {sourceGroup: string, sourceIdx: number, targetGroup: string, targetIdx: number}) => void} options.onReorder
 *        Called on a valid drop. Receives the source item identity and the
 *        target group + computed drop index. The consumer mutates its model here.
 *        Invoked with `this` bound to the Alpine component, so a regular (non-arrow)
 *        function can reach `this.model`.
 * @param {string} [options.itemSelector='.draggable-item'] CSS selector matching
 *        the draggable rows inside a list — used to measure drop position.
 * @param {string} [options.draggingClass='is-dragging'] CSS class toggled on the
 *        dragged element for the duration of the drag.
 * @returns {object} Alpine data-fn fragment: isDragOver / dragStart / dragEnd /
 *        dragOver / dragLeave / drop (plus transient _dragSource / _dragOverGroup).
 */
export function draggableList(options = {}) {
  const onReorder = typeof options.onReorder === 'function' ? options.onReorder : null;
  const itemSelector = options.itemSelector ?? '.draggable-item';
  const draggingClass = options.draggingClass ?? 'is-dragging';

  return {
    /** @type {{ group: string|null, idx: number|null }} identity of the dragged item */
    _dragSource: { group: null, idx: null },
    /** @type {string|null} group currently shown as drop target */
    _dragOverGroup: null,

    /**
     * @param {string} group
     * @returns {boolean} true while this group is the active drop target
     */
    isDragOver(group) {
      return this._dragOverGroup === group;
    },

    /**
     * @param {string} group source list key
     * @param {number} idx source item index
     * @param {DragEvent} $event dragstart on the item element
     */
    dragStart(group, idx, $event) {
      this._dragSource.group = group;
      this._dragSource.idx = idx;
      $event.target.classList.add(draggingClass);
      if ($event.dataTransfer) $event.dataTransfer.effectAllowed = 'move';
    },

    /** @param {DragEvent} $event dragend on the item element */
    dragEnd($event) {
      $event.target.classList.remove(draggingClass);
      this._dragOverGroup = null;
      this._dragSource = { group: null, idx: null };
    },

    /**
     * @param {string} group list key under the pointer
     * @param {DragEvent} $event dragover on the list container
     */
    dragOver(group, $event) {
      $event.preventDefault();
      if ($event.dataTransfer) $event.dataTransfer.dropEffect = 'move';
      this._dragOverGroup = group;
    },

    /**
     * Clears the drop-target highlight only when the pointer truly leaves the
     * list (not when it merely crosses into a child element).
     * @param {string} group list key
     * @param {DragEvent} $event dragleave on the list container
     */
    dragLeave(group, $event) {
      if (!$event.currentTarget.contains($event.relatedTarget)) {
        if (this._dragOverGroup === group) this._dragOverGroup = null;
      }
    },

    /**
     * @param {string} targetGroup list key the item is dropped into
     * @param {DragEvent} $event drop on the list container
     */
    drop(targetGroup, $event) {
      $event.preventDefault();
      const sourceGroup = this._dragSource.group;
      const sourceIdx = this._dragSource.idx;
      this._dragOverGroup = null;
      if (sourceGroup === null) return;

      const items = $event.currentTarget.querySelectorAll(itemSelector);
      const targetIdx = computeDropIndex(items, $event.clientY);
      if (onReorder) {
        onReorder.call(this, { sourceGroup, sourceIdx, targetGroup, targetIdx });
      }
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
   Reorderable table rows — the .dmike-table--draggable counterpart.
   ──────────────────────────────────────────────────────────────────────── */

export const DRAGGING_CLASS = 'dmike-table__row--dragging';
export const DROP_TARGET_CLASS = 'dmike-table__row--drop-target';

/**
 * Shared `mouseup` listener that disarms every `draggable` a grip has armed.
 * Ref-counted so one module's destroy() does not tear it down for another.
 * @type {{ handler: (() => void)|null, refs: number }}
 */
const armRegistry = { handler: null, refs: 0 };

/** Register the global disarm listener (idempotent, ref-counted). */
function acquireDisarm(doc) {
  armRegistry.refs += 1;
  if (armRegistry.handler) return;
  armRegistry.handler = () => {
    doc.querySelectorAll('tr[draggable="true"]').forEach(tr => tr.removeAttribute('draggable'));
  };
  doc.addEventListener('mouseup', armRegistry.handler);
}

/** Drop one reference; unregister once the last consumer is gone. */
function releaseDisarm(doc) {
  armRegistry.refs = Math.max(0, armRegistry.refs - 1);
  if (armRegistry.refs > 0 || !armRegistry.handler) return;
  doc.removeEventListener('mouseup', armRegistry.handler);
  armRegistry.handler = null;
}

/** Lazily created, shared aria-live region for keyboard reorder feedback. */
function announce(doc, message) {
  let region = doc.getElementById('dmike-live-region');
  if (!region) {
    region = doc.createElement('div');
    region.id = 'dmike-live-region';
    region.className = 'dmike-sr-only';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('role', 'status');
    doc.body.appendChild(region);
  }
  // Re-setting identical text does not re-announce — clear first.
  region.textContent = '';
  region.textContent = message;
}

/**
 * Alpine data-mixin for **reordering rows of a `.dmike-table--draggable`**.
 *
 * Rows are addressed by id, not by index — this suits both flat lists and
 * trees (where a drop means "move this row before that one" and any subtree
 * travels along). The mixin owns the transient drag state, the state classes
 * and the keyboard affordance; the consumer supplies `onMove` and performs the
 * actual move on its own model.
 *
 * Every handler takes a `group` key first, mirroring draggableList(). One
 * component can therefore drive several independent tables (Ishikawa has
 * three) through a single mixin instance, and a row can never be dropped into
 * a foreign table — drops across groups are rejected.
 *
 * Crucially, `draggable` is **not** in the markup. The grip arms it on
 * `mousedown` and a shared document `mouseup` disarms it, so a permanently
 * draggable row never breaks text selection inside the row's cell inputs.
 *
 * Template contract: see the .dmike-table--draggable block in components.css.
 *
 * @param {object} options
 * @param {(move: {group: string, sourceId: *, targetId: *}) => void} options.onMove
 *        Called on a valid drop and on each keyboard step. `group` says which
 *        table moved. Invoked with `this` bound to the Alpine component, so a
 *        regular (non-arrow) function can reach `this.model`.
 * @param {(group: string, id: *) => Array<*>} [options.rowIds]
 *        Given a table key and a row id, the ordered ids of the rows it may
 *        move among — the whole table for a flat list, the row's siblings for
 *        a tree. Required for keyboard reordering; without it Alt+Arrow is
 *        inert (mouse drag still works).
 * @param {(key: string, params?: object) => string} [options.t]
 *        Translator for the aria-live message (`common.rowMoved`).
 * @param {Document} [options.doc=document] Injectable for tests.
 * @returns {object} Alpine data-fn fragment.
 */
export function draggableRows(options = {}) {
  const onMove = typeof options.onMove === 'function' ? options.onMove : null;
  const rowIds = typeof options.rowIds === 'function' ? options.rowIds : null;
  const translate = typeof options.t === 'function' ? options.t : null;
  // `doc: null` must stay null (tests opt out of the live region), so only an
  // absent option falls back to the ambient document.
  const doc = 'doc' in options
    ? options.doc
    : (typeof document !== 'undefined' ? document : null);

  /** Strip both state classes from every row of the table owning `node`. */
  const clearState = (node) => {
    const scope = node?.closest?.('table') ?? doc;
    if (!scope) return;
    scope.querySelectorAll(`.${DRAGGING_CLASS}, .${DROP_TARGET_CLASS}`)
      .forEach(el => el.classList.remove(DRAGGING_CLASS, DROP_TARGET_CLASS));
  };

  return {
    /** @type {{ group: string|null, id: * }} identity of the dragged row */
    _dragRow: { group: null, id: null },

    /** Register the shared disarm listener. Call from the component's init(). */
    dragRowsInit() {
      if (doc) acquireDisarm(doc);
    },

    /** Drop the shared disarm reference. Call from the component's destroy(). */
    dragRowsDestroy() {
      if (doc) releaseDisarm(doc);
    },

    /**
     * `mousedown` on the grip — arm the owning row for dragging.
     * @param {MouseEvent} $event
     */
    dragArm($event) {
      const tr = $event.target.closest('tr');
      if (tr) tr.setAttribute('draggable', 'true');
    },

    /**
     * @param {string} group table key
     * @param {*} id row id
     * @param {DragEvent} $event dragstart on the row
     */
    dragStart(group, id, $event) {
      this._dragRow = { group, id };
      const tr = $event.target.closest?.('tr') ?? $event.target;
      tr.classList.add(DRAGGING_CLASS);
      if ($event.dataTransfer) $event.dataTransfer.effectAllowed = 'move';
    },

    /** @param {DragEvent} $event dragend on the row */
    dragEnd($event) {
      this._dragRow = { group: null, id: null };
      const tr = $event.target.closest?.('tr') ?? $event.target;
      tr.removeAttribute?.('draggable');
      clearState(tr);
    },

    /**
     * @param {string} group table key of the row under the pointer
     * @param {*} id row id under the pointer
     * @param {DragEvent} $event dragover on the row
     */
    dragOver(group, id, $event) {
      if (group !== this._dragRow.group) return;   // never across tables
      $event.preventDefault();
      if ($event.dataTransfer) $event.dataTransfer.dropEffect = 'move';
      const tr = $event.currentTarget;
      const scope = tr.closest?.('table');
      scope?.querySelectorAll(`.${DROP_TARGET_CLASS}`)
        .forEach(el => el.classList.remove(DROP_TARGET_CLASS));
      if (id !== this._dragRow.id) tr.classList.add(DROP_TARGET_CLASS);
    },

    /**
     * @param {string} group table key the row was released over
     * @param {*} targetId row id the pointer was released over
     * @param {DragEvent} $event drop on the row
     */
    dragDrop(group, targetId, $event) {
      $event.preventDefault();
      const { group: sourceGroup, id: sourceId } = this._dragRow;
      this._dragRow = { group: null, id: null };
      clearState($event.currentTarget);
      if (sourceId === null || sourceId === targetId) return;
      if (sourceGroup !== group) return;           // never across tables
      if (onMove) onMove.call(this, { group, sourceId, targetId });
    },

    /**
     * Alt+ArrowUp / Alt+ArrowDown on the grip moves the row one position.
     * No wrap-around at either end. Focus stays on the grip.
     * @param {string} group table key
     * @param {*} id row id owning the grip
     * @param {KeyboardEvent} $event
     */
    dragKey(group, id, $event) {
      if (!$event.altKey) return;
      const up = $event.key === 'ArrowUp';
      const down = $event.key === 'ArrowDown';
      if (!up && !down) return;
      if (!rowIds || !onMove) return;

      const ids = rowIds.call(this, group, id) || [];
      const from = ids.indexOf(id);
      if (from < 0) return;
      const to = up ? from - 1 : from + 1;
      if (to < 0 || to >= ids.length) return;   // at the edge — do nothing

      $event.preventDefault();
      // Both directions are expressed as "move X before Y" so the consumer
      // never needs an append path: moving down one position is the same as
      // moving the next row up before this one.
      const move = up
        ? { sourceId: id, targetId: ids[to] }
        : { sourceId: ids[to], targetId: id };
      onMove.call(this, { group, ...move });

      if (translate && doc) {
        announce(doc, translate('common.rowMoved', { pos: to + 1, total: ids.length }));
      }
    },
  };
}

/**
 * Compute the insert index for a pointer drop over a vertical list of items.
 * Walks the items top-to-bottom and returns the index of the first item whose
 * vertical midpoint is below the pointer; if the pointer is below every item,
 * returns `items.length` (append). Pure — depends only on each item's
 * `getBoundingClientRect()` and the pointer's `clientY`.
 *
 * @param {ArrayLike<{ getBoundingClientRect: () => {top:number, height:number} }>} items
 *        Draggable elements in DOM order (e.g. a NodeList).
 * @param {number} clientY pointer Y coordinate (viewport space)
 * @returns {number} insert index in [0, items.length]
 */
export function computeDropIndex(items, clientY) {
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const rect = items[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return n;
}
