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
