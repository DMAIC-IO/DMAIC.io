/**
 * Model des Einwilligungsdialogs der Agentenfläche.
 *
 * Es gibt nichts zu wählen: der Bestätigungsknopf ist die Zustimmung, der
 * Abbruch-Knopf die Ablehnung (createDialog liefert dafür `null`). Das Model
 * trägt nur den Projektnamen für den Dialogtext.
 */
export class Model {
  /** @type {string} Name des Projekts, auf das zugegriffen werden soll */
  projectName = '';

  /**
   * @param {{ projectName?: string }} [init]
   * @returns {Model} this (für `new Model().apply(…)`)
   */
  apply(init = {}) {
    this.projectName = init?.projectName ?? '';
    return this;
  }

  /** @returns {true} Es gibt keine Eingabe, die ungültig sein könnte. */
  validate() { return true; }

  /** @returns {true} Bestätigung heißt Zustimmung. */
  result() { return true; }
}
