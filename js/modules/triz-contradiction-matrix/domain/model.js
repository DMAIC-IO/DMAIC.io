/**
 * D.Mike — TRIZ-Widerspruchsmatrix: Model.
 *
 * Ein technischer Widerspruch aus einem verbessernden und einem sich
 * verschlechternden Parameter (je 1 bis 39 nach Altschuller), eine
 * Problemnotiz und als Ansichtsfeld, ob die vollständige Matrix sichtbar ist.
 * Die empfohlenen erfinderischen Prinzipien sind abgeleitet. Gespeichert:
 * `{ _schema, improving, worsening, problemNote, showMatrix }`.
 */
import { defineModel, command, number, text, boolean } from '../../../core/model.js';
import { from0 } from './migrations.js';
import { recommendationOf } from './matrix.js';

/**
 * Ein empfohlenes erfinderisches Prinzip.
 *
 * @typedef {object} RecommendedPrinciple
 * @property {number} id  number of the inventive principle (1 to 40)
 * @property {string} name  name of the principle in the active language
 * @property {string} description  short description of the principle in the active language
 */

/**
 * Die Empfehlung zum gewählten Paar.
 *
 * @typedef {object} Recommendation
 * @property {'incomplete'|'sameParameter'|'noEntry'|'found'} status  incomplete: a parameter is missing; sameParameter: both are the same; noEntry: the matrix cell is empty; found: principles are recommended
 * @property {RecommendedPrinciple[]} principles  the recommended principles in the order of the matrix cell; empty unless status is found
 */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** der Parameter, der verbessert werden soll (1 bis 39); leer, solange keiner gewählt ist */
    improving: number({ integer: true, min: 1, max: 39, nullable: true }),
    /** der Parameter, der sich dabei verschlechtert (1 bis 39); leer, solange keiner gewählt ist */
    worsening: number({ integer: true, min: 1, max: 39, nullable: true }),
    /** die Problemnotiz zum Widerspruch */
    problemNote: text(),
  },
  view: {
    /** ob die vollständige 39×39-Matrix angezeigt wird */
    showMatrix: boolean(),
  },
  commands: {
    swapParams: command({
      params: {},
      run() {
        const i = this.improving;
        this.improving = this.worsening;
        this.worsening = i;
      },
    }),
    pickCell: command({
      params: {
        improving: number({ integer: true, min: 1, max: 39 }),
        worsening: number({ integer: true, min: 1, max: 39 }),
      },
      run({ improving, worsening }) {
        this.improving = improving;
        this.worsening = worsening;
      },
    }),
  },
  derived: {
    /**
     * Die empfohlenen erfinderischen Prinzipien zum gewählten Paar, mit Namen
     * und Beschreibung in der aktiven Sprache, wie sie die Oberfläche zeigt.
     *
     * @param {import('../../../core/source-reader.js').Source} _src
     * @param {any} _d
     * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {Recommendation}
     */
    recommendation(_src, _d, t) {
      const { status, ids } = recommendationOf(this.improving, this.worsening);
      return {
        status,
        principles: ids.map((id) => ({
          id,
          name: t(`principles.${id}.name`),
          description: t(`principles.${id}.description`),
        })),
      };
    },
  },
});
