/**
 * Alpine data-mixin for a draggable popout that lives **inside** a module's
 * Alpine template, reusing the dmike-chart-popout CSS shell.
 *
 * Unlike popout.js (imperative createElement helpers for confirm/alert/form),
 * this keeps the markup in the template: the module renders the overlay with
 * `x-if`/`x-show` and binds the handlers below. Spread the returned object into
 * the module's `data()` return value.
 *
 * Template contract:
 * ```html
 * <div class="dmike-chart-popout-overlay"
 *      @click.self="popoutClose()"               <!-- supply your own close -->
 *      @keydown.escape.window="popoutClose()"
 *      @mousemove.window="popoutDragMove($event)"
 *      @mouseup.window="popoutDragEnd()">
 *   <div class="dmike-chart-popout" :style="popoutStyle()">
 *     <div class="dmike-chart-popout-titlebar" @mousedown="popoutDragStart($event)">…</div>
 *     …
 *   </div>
 * </div>
 * ```
 *
 * Call `popoutResetPosition()` whenever the popout is (re)opened so it returns
 * to its initial centred position.
 *
 * @param {object} [options]
 * @param {string} [options.size] - Fixed size CSS (width/height/max-height). Must end with ';'.
 * @param {string} [options.initialPosition] - left/top CSS used before the first drag.
 * @param {string} [options.windowSelector] - Selector of the draggable window element.
 * @param {string} [options.closeSelector] - Selector whose elements must NOT start a drag.
 * @returns {object} Alpine data-fn fragment: popoutStyle / popoutDragStart / popoutDragMove / popoutDragEnd / popoutResetPosition
 */
export function draggablePopout(options = {}) {
  const size = options.size ?? 'width:520px;height:auto;max-height:80vh;';
  const initialPosition = options.initialPosition ?? 'left:calc(50% - 260px);top:60px';
  const windowSelector = options.windowSelector ?? '.dmike-chart-popout';
  const closeSelector = options.closeSelector ?? '.dmike-chart-popout-close';

  return {
    _popLeft: null,
    _popTop: null,
    _popDragging: false,
    _popOffX: 0,
    _popOffY: 0,

    /** Inline style for the popout window — centred until the user drags it. */
    popoutStyle() {
      if (this._popLeft == null || this._popTop == null) {
        return size + initialPosition;
      }
      return `${size  }left:${  this._popLeft  }px;top:${  this._popTop  }px`;
    },

    /** Restore the centred default position (call on open). */
    popoutResetPosition() {
      this._popLeft = null;
      this._popTop = null;
      this._popDragging = false;
    },

    /** @param {MouseEvent} $event mousedown on the title bar */
    popoutDragStart($event) {
      if (closeSelector && $event.target.closest(closeSelector)) return;
      const win = $event.currentTarget.closest(windowSelector);
      if (!win) return;
      this._popLeft = win.offsetLeft;
      this._popTop = win.offsetTop;
      this._popOffX = $event.clientX - win.offsetLeft;
      this._popOffY = $event.clientY - win.offsetTop;
      this._popDragging = true;
    },

    /** @param {MouseEvent} $event window mousemove */
    popoutDragMove($event) {
      if (!this._popDragging) return;
      this._popLeft = $event.clientX - this._popOffX;
      this._popTop = $event.clientY - this._popOffY;
    },

    popoutDragEnd() {
      this._popDragging = false;
    },
  };
}
