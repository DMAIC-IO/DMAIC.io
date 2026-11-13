/**
 * D.Mike — Verlauf je Modulinstanz (module-history.js)
 *
 * Reine Klasse ohne Alpine und DOM: hält Stände als JSON-Text, zwei Stapel
 * (Rückgängig, Wiederholen) und optional einen offenen Schritt, in den alle
 * Änderungen laufen, bis er geschlossen wird (Tippen in einem Feld).
 */
export class ModuleHistory {
  /** @param {{ depth?: number }} [opts] Höchstzahl der Rückgängig-Schritte (Vorgabe 50) */
  constructor({ depth = 50 } = {}) {
    this._depth = depth;
    /** @type {string[]} */ this._undo = [];
    /** @type {string[]} */ this._redo = [];
    /** @type {string|null} */ this._current = null;
    this._open = false;
    this._dirty = false;
  }

  /**
   * Neue Grundlage: beide Stapel leer, kein offener Schritt.
   * @param {string} json
   */
  reset(json) {
    this._undo = [];
    this._redo = [];
    this._current = json;
    this._open = false;
    this._dirty = false;
  }

  /**
   * Meldet einen neuen Stand. Gleicher Text wie der aktuelle: nichts. In einem
   * offenen Schritt ersetzt er dessen Ende.
   * @param {string} json
   */
  record(json) {
    if (json === this._current) return;
    if (!this._open || !this._dirty) {
      this._undo.push(this._current);
      if (this._undo.length > this._depth) this._undo.shift();
      this._redo = [];
      if (this._open) this._dirty = true;
    }
    this._current = json;
  }

  /** Öffnet einen Schritt; ein bereits offener bleibt offen. */
  begin() {
    if (this._open) return;
    this._open = true;
    this._dirty = false;
  }

  /** Schließt den offenen Schritt; endet er auf dem Ausgangsstand, entsteht kein Eintrag. */
  end() {
    if (!this._open) return;
    if (this._dirty && this._undo.at(-1) === this._current) this._undo.pop();
    this._open = false;
    this._dirty = false;
  }

  /** @returns {string|null} der zurückzuschreibende Stand, sonst null */
  undo() {
    this.end();
    if (this._undo.length === 0) return null;
    this._redo.push(this._current);
    this._current = this._undo.pop();
    return this._current;
  }

  /** @returns {string|null} der zurückzuschreibende Stand, sonst null */
  redo() {
    this.end();
    if (this._redo.length === 0) return null;
    this._undo.push(this._current);
    this._current = this._redo.pop();
    return this._current;
  }

  /** @returns {boolean} ob ein Schritt offen ist */
  get isOpen() { return this._open; }

  /** @returns {boolean} */
  get canUndo() { return this._undo.length > 0; }

  /** @returns {boolean} */
  get canRedo() { return this._redo.length > 0; }
}
