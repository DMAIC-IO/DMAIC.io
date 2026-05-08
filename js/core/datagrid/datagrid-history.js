/**
 * D.Mike — DataGrid History (datagrid-history.js)
 * Stack-based undo/redo with configurable depth.
 */

export class History {
  /** @param {number} maxSize */
  constructor(maxSize = 50) {
    this._stack = [];
    this._index = -1;
    this._max = maxSize;
  }

  /** Push a new action, discarding any redo entries. */
  push(action) {
    this._stack = this._stack.slice(0, this._index + 1);
    this._stack.push(action);
    if (this._stack.length > this._max) this._stack.shift();
    this._index = this._stack.length - 1;
  }

  /** Pop the current action for undo. */
  undo() {
    if (!this.canUndo()) return null;
    return this._stack[this._index--];
  }

  /** Advance to the next action for redo. */
  redo() {
    if (!this.canRedo()) return null;
    return this._stack[++this._index];
  }

  canUndo() { return this._index >= 0; }
  canRedo() { return this._index < this._stack.length - 1; }
  clear() { this._stack = []; this._index = -1; }
}
