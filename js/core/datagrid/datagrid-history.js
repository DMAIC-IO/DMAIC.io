/**
 * D.Mike — DataGrid History (datagrid-history.js)
 * Stack-based undo/redo with configurable depth.
 *
 * `begin()`/`end()` bracket a group: the actions pushed in between become ONE
 * entry `{ type: 'group', actions }`. An empty group leaves no entry, a single
 * action stays ungrouped. Nested `begin()` calls count; only the outermost
 * `end()` closes the group.
 */

export class History {
  /** @param {number} maxSize */
  constructor(maxSize = 50) {
    this._stack = [];
    this._index = -1;
    this._max = maxSize;
    /** Open `begin()` calls without their `end()`. */
    this._depth = 0;
    /** Actions collected by the open group, oldest first. */
    this._open = [];
  }

  /** Push a new action, discarding any redo entries. */
  push(action) {
    if (this._depth > 0) {
      if (this._open.length === 0) this._stack = this._stack.slice(0, this._index + 1);
      this._open.push(action);
      return;
    }
    this._commit(action);
  }

  /** Opens a group; a nested call only counts. */
  begin() { this._depth += 1; }

  /** Closes the group on the outermost call; without an open group nothing happens. */
  end() {
    if (this._depth === 0) return;
    this._depth -= 1;
    if (this._depth === 0) this._flush();
  }

  /** Pop the current action for undo. */
  undo() {
    this._flush();
    if (!this.canUndo()) return null;
    return this._stack[this._index--];
  }

  /** Advance to the next action for redo. */
  redo() {
    this._flush();
    if (!this.canRedo()) return null;
    return this._stack[++this._index];
  }

  /** @returns {object|null} der nächste `undo`-Eintrag, ohne die Historie zu bewegen */
  peek() { return this._index >= 0 ? this._stack[this._index] : null; }

  canUndo() { return this._index >= 0 || this._open.length > 0; }
  canRedo() { return this._open.length === 0 && this._index < this._stack.length - 1; }

  /** Empties the stack and the actions of an open group; the group itself stays open. */
  clear() { this._stack = []; this._index = -1; this._open = []; }

  /** Stores one entry on top, dropping the oldest beyond the depth. */
  _commit(action) {
    this._stack = this._stack.slice(0, this._index + 1);
    this._stack.push(action);
    if (this._stack.length > this._max) this._stack.shift();
    this._index = this._stack.length - 1;
  }

  /** Moves the collected actions of the open group onto the stack as one entry. */
  _flush() {
    const actions = this._open;
    if (actions.length === 0) return;
    this._open = [];
    this._commit(actions.length === 1 ? actions[0] : { type: 'group', actions });
  }
}
