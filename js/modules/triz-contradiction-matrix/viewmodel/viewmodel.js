/**
 * D.Mike — Widerspruchsmatrix (TRIZ): Viewmodel.
 *
 * Beide Parameter, die Problemnotiz und die Matrixanzeige liegen im Model
 * (domain/model.js): die Auswahllisten binden über `x-field`, die Notiz und
 * das Kontrollkästchen der Matrix über `x-model`, Tauschknopf und Matrixzellen
 * rufen die Model-Kommandos `swapParams` und `pickCell`. Die Empfehlung ist
 * die Ableitung `recommendation`. Hier bleiben nur Anzeigeentscheidungen:
 * Texte der Parameter, Zustand der Empfehlung, Klassen, Titel und Inhalt der
 * Matrixzellen und die ids je Instanz.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { MATRIX, PARAMETER_COUNT } from '../domain/matrix.js';

/** Die Nummern der Parameter, 1 bis 39. @type {ReadonlyArray<number>} */
const PARAMETER_IDS = Object.freeze(Array.from({ length: PARAMETER_COUNT }, (_, k) => k + 1));

/** Die Indizes der Zeilen und Spalten der Matrix, 0 bis 38. @type {ReadonlyArray<number>} */
const INDEXES = Object.freeze(Array.from({ length: PARAMETER_COUNT }, (_, k) => k));

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      /** Die Nummern der Parameter in Anzeigereihenfolge (Optionen der Auswahllisten). @returns {ReadonlyArray<number>} */
      get parameterIds() { return PARAMETER_IDS; },

      /** Die Indizes der Zeilen und Spalten der Matrix. @returns {ReadonlyArray<number>} */
      get indexes() { return INDEXES; },

      /** Text einer Option: „9. Geschwindigkeit“. @param {number} id @returns {string} */
      optionText(id) { return `${id}. ${this.t(`parameters.${id}.name`)}`; },

      /** Beschreibung eines Parameters, ohne Wahl leer. @param {number|null} id @returns {string} */
      paramDesc(id) { return id == null ? '' : this.t(`parameters.${id}.description`); },

      /** Hinweis „beide Parameter wählen“. @returns {boolean} */
      get showHint() { return this.recommendation.status === 'incomplete'; },

      /** Warnung „gleicher Parameter“. @returns {boolean} */
      get showWarn() { return this.recommendation.status === 'sameParameter'; },

      /** Hinweis „keine Empfehlung“. @returns {boolean} */
      get showNoEntry() { return this.recommendation.status === 'noEntry'; },

      /** Karten der empfohlenen Prinzipien. @returns {boolean} */
      get showPrinciples() { return this.recommendation.status === 'found'; },

      /** Nummer des Parameters zu einem Index der Matrix. @param {number} i @returns {number} */
      paramId(i) { return i + 1; },

      /** Beschriftung eines Zeilen- oder Spaltenkopfs. @param {number} i @returns {string} */
      headLabel(i) { return String(i + 1); },

      /** Klasse eines Zeilenkopfs: hervorgehoben beim verbessernden Parameter. @param {number} i @returns {string} */
      rowHeadClass(i) { return this.model.improving === i + 1 ? 'is-active' : ''; },

      /** Klasse eines Spaltenkopfs: hervorgehoben beim sich verschlechternden Parameter. @param {number} j @returns {string} */
      colHeadClass(j) { return this.model.worsening === j + 1 ? 'is-active' : ''; },

      /** Titel eines Kopfs: „9. Geschwindigkeit“. @param {number} i @returns {string} */
      headTitle(i) { return this.optionText(i + 1); },

      /** Spaltenindizes links der Diagonale in Zeile `i`. @param {number} i @returns {number[]} */
      cellsBefore(i) { return INDEXES.slice(0, i); },

      /** Spaltenindizes rechts der Diagonale in Zeile `i`. @param {number} i @returns {number[]} */
      cellsAfter(i) { return INDEXES.slice(i + 1); },

      /** Klassen einer Zelle: Diagonale, leer oder gefüllt, dazu die gewählte. @param {number} i @param {number} j @returns {string} */
      cellClass(i, j) {
        const kind = i === j ? 'is-diag' : MATRIX[i][j] === null ? 'is-empty' : 'is-filled';
        const picked = this.model.improving === i + 1 && this.model.worsening === j + 1;
        return picked ? `${kind} is-picked` : kind;
      },

      /** Titel einer Zelle: beide Parameter mit Pfeil und die empfohlenen Prinzipien. @param {number} i @param {number} j @returns {string} */
      cellTitle(i, j) {
        if (i === j) return `${i + 1} \u2194 ${i + 1}`;
        const head = `${i + 1}\u2191 ${this.t(`parameters.${i + 1}.name`)} / ${j + 1}\u2193 ${this.t(`parameters.${j + 1}.name`)}`;
        const cell = MATRIX[i][j];
        return cell ? `${head}: ${cell.join(', ')}` : head;
      },

      /** Inhalt einer Zelle: Punkt auf der Diagonale, sonst die Anzahl der Prinzipien oder leer. @param {number} i @param {number} j @returns {string} */
      cellContent(i, j) {
        if (i === j) return '\u00b7';
        const cell = MATRIX[i][j];
        return cell === null ? '' : String(cell.length);
      },

      /**
       * id eines Elements, eindeutig je Instanz: `<label for>` zeigt so auch
       * bei mehreren offenen Instanzen auf die eigene Auswahlliste.
       * @param {string} name Kurzname des Elements
       * @returns {string}
       */
      fieldId(name) { return `triz-cm-${name}-${ctx.instanceId}`; },
    };
  },
});
