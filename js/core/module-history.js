/**
 * D.Mike — Verlauf je Modulinstanz (module-history.js)
 *
 * Reine Klasse ohne Alpine und DOM: zwei Stapel (Rückgängig, Wiederholen) und
 * optional einen offenen Schritt, in den alle Änderungen laufen, bis er
 * geschlossen wird (Tippen in einem Feld).
 *
 * Zwei Arten von Schritten:
 * - Abzug (`record(json)`): der Stapel hält Stände als JSON-Text, `undo()`/`redo()`
 *   liefern den zurückzuschreibenden Text.
 * - Umkehrung (`recordInverse(undo, redo)`): ein Schritt ist `{ undo: cmd[], redo: cmd[] }`,
 *   `undo()`/`redo()` liefern `{ kind: 'inverse', cmds }`.
 */
/** @typedef {{ undo: object[], redo: object[] }} InverseStep */

export class ModuleHistory {
  /** @param {{ depth?: number }} [opts] Höchstzahl der Rückgängig-Schritte (Vorgabe 50) */
  constructor({ depth = 50 } = {}) {
    this._depth = depth;
    /** @type {Array<string|InverseStep>} */ this._undo = [];
    /** @type {Array<string|InverseStep>} */ this._redo = [];
    /** Der zuletzt von undo/redo bewegte Umkehrschritt (für `replaceInverse`). */
    /** @type {{ step: InverseStep, side: 'undo'|'redo' }|null} */ this._moved = null;
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
    this._moved = null;
  }

  /**
   * Meldet einen Schritt als Umkehr-Kommandos. In einem offenen Schritt
   * sammeln sich die Listen: `undo` kommt vorne dazu (neueste zuerst), `redo` hinten.
   * @param {object[]} undo Kommandos, die die Änderung zurücknehmen (in Ausführungsreihenfolge)
   * @param {object[]} redo Kommandos, die sie erneut ausführen
   */
  recordInverse(undo, redo) {
    this._moved = null;
    const top = this._undo.at(-1);
    if (this._open && this._dirty && top && typeof top === 'object') {
      top.undo = [...undo, ...top.undo];
      top.redo = [...top.redo, ...redo];
      return;
    }
    this._undo.push({ undo: [...undo], redo: [...redo] });
    if (this._undo.length > this._depth) this._undo.shift();
    this._redo = [];
    if (this._open) this._dirty = true;
  }

  /**
   * Ersetzt die Gegenrichtung des eben von `undo()`/`redo()` bewegten
   * Umkehrschritts: nach `undo()` dessen `redo`, nach `redo()` dessen `undo`.
   * Ohne bewegten Umkehrschritt: nichts.
   * @param {object[]} cmds
   */
  replaceInverse(cmds) {
    const m = this._moved;
    if (!m) return;
    m.step[m.side] = [...cmds];
  }

  /**
   * Legt den eben von `undo()`/`redo()` bewegten Umkehrschritt auf seinen alten
   * Stapel zurück (ein Schritt, dessen Ausführung scheiterte). Ohne bewegten
   * Umkehrschritt: nichts.
   */
  cancelMove() {
    const m = this._moved;
    if (!m) return;
    this._moved = null;
    if (m.side === 'redo') this._undo.push(/** @type {InverseStep} */ (this._redo.pop()));
    else this._redo.push(/** @type {InverseStep} */ (this._undo.pop()));
  }

  /**
   * Meldet einen neuen Stand. Gleicher Text wie der aktuelle: nichts. In einem
   * offenen Schritt ersetzt er dessen Ende.
   * @param {string} json
   */
  record(json) {
    this._moved = null;
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

  /**
   * @returns {string|{ kind: 'inverse', cmds: object[] }|null} der zurückzuschreibende
   *   Stand bzw. die auszuführenden Umkehr-Kommandos, sonst null
   */
  undo() {
    this.end();
    this._moved = null;
    if (this._undo.length === 0) return null;
    const top = this._undo.at(-1);
    if (typeof top === 'object' && top !== null) {
      this._redo.push(this._undo.pop());
      this._moved = { step: top, side: 'redo' };
      return { kind: 'inverse', cmds: [...top.undo] };
    }
    this._redo.push(this._current);
    this._current = /** @type {string} */ (this._undo.pop());
    return this._current;
  }

  /**
   * @returns {string|{ kind: 'inverse', cmds: object[] }|null} der zurückzuschreibende
   *   Stand bzw. die auszuführenden Kommandos, sonst null
   */
  redo() {
    this.end();
    this._moved = null;
    if (this._redo.length === 0) return null;
    const top = this._redo.at(-1);
    if (typeof top === 'object' && top !== null) {
      this._undo.push(this._redo.pop());
      this._moved = { step: top, side: 'undo' };
      return { kind: 'inverse', cmds: [...top.redo] };
    }
    this._undo.push(this._current);
    this._current = /** @type {string} */ (this._redo.pop());
    return this._current;
  }

  /** @returns {boolean} ob ein Schritt offen ist */
  get isOpen() { return this._open; }

  /** @returns {boolean} */
  get canUndo() { return this._undo.length > 0; }

  /** @returns {boolean} */
  get canRedo() { return this._redo.length > 0; }
}
