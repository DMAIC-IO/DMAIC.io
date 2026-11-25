/**
 * D.Mike — Physikalischer Widerspruch (TRIZ): Viewmodel.
 *
 * Texte, Notizen und die Wahl des Trennungsprinzips liegen im Model
 * (domain/model.js): die Texte binden im Template über `x-model`, die Wahl
 * über `x-set` an der Radiogruppe, der Tauschknopf ruft das Model-Kommando
 * `swap`. Hier bleiben nur Anzeigeentscheidungen: Reihenfolge, Nummer, Icon
 * und Texte je Prinzip, die Klasse der gewählten Karte und die ids je
 * Instanz.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { PRINCIPLES } from '../domain/principles.js';

/**
 * Trennungsprinzip → Icon-Name. Steht hier und nicht in i18n: das Icon ist
 * keine Übersetzung.
 * @type {Record<string, string>}
 */
const PRINCIPLE_ICONS = {
  time: 'domain.time',
  space: 'domain.space',
  condition: 'domain.condition',
  system: 'domain.system',
};

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      /** Die vier Trennungsprinzipien in Anzeigereihenfolge (Karten). @returns {ReadonlyArray<string>} */
      get principles() { return PRINCIPLES; },

      /** Laufende Nummer eines Prinzips, ab 1. @param {string} key @returns {number} */
      principleNum(key) { return PRINCIPLES.indexOf(key) + 1; },

      /** Icon eines Prinzips. @param {string} key @returns {string} */
      principleIcon(key) { return PRINCIPLE_ICONS[key]; },

      /** Übersetzter Name eines Prinzips. @param {string} key @returns {string} */
      principleName(key) { return this.t(`principles.${key}.name`); },

      /** Übersetzte Leitfrage eines Prinzips. @param {string} key @returns {string} */
      principleQuestion(key) { return this.t(`principles.${key}.question`); },

      /** Übersetztes Beispiel eines Prinzips. @param {string} key @returns {string} */
      principleExample(key) { return this.t(`principles.${key}.example`); },

      /** Klasse der Karte: hervorgehoben, wenn das Prinzip gewählt ist. @param {string} key @returns {string} */
      principleClass(key) { return this.model.selectedPrinciple === key ? 'is-selected' : ''; },

      /** Übersetzter Name des gewählten Prinzips, sonst leer. @returns {string} */
      chosenPrincipleName() {
        const key = this.model.selectedPrinciple;
        return key ? this.t(`principles.${key}.name`) : '';
      },

      /**
       * id eines Elements, eindeutig je Instanz: `<label for>` und
       * `aria-labelledby` zeigen so auch bei mehreren offenen Instanzen auf
       * das eigene Element.
       * @param {string} name Kurzname des Elements
       * @returns {string}
       */
      fieldId(name) { return `triz-pc-${name}-${ctx.instanceId}`; },

      /** id des Namens einer Prinzipkarte; beschriftet deren Notizfeld. @param {string} key @returns {string} */
      principleTitleId(key) { return this.fieldId(`title-${key}`); },
    };
  },
});
