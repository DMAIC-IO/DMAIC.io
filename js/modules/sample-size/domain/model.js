/**
 * D.Mike — Stichprobenumfang: Model.
 *
 * Gespeichert werden Kategorie, Testtyp, Testrichtung, α, Ziel-Power und die
 * Effektangaben aller drei Varianten unter `effect` (Regel M6: es wirken nur
 * die der gewählten Kategorie und des Testtyps, siehe `activeParams`).
 * Ansicht: die Editor-Einstellungen der Power-Kurve. Das Ergebnis liefert die
 * Ableitung `result`.
 */
import { defineModel, number, oneOf, object } from '../../../core/model.js';
import { roundTo } from '../../../core/number-format.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';
import { VARIANTS, variantOf } from './variants.js';
import { analyze } from './calc.js';
import { from0 } from './migrations.js';

/** @typedef {import('./calc.js').Result} Result */

/** Die Felder, die in jeder Variante wirken. */
const BASE_PARAMS = Object.freeze(['category', 'testType', 'direction', 'alpha', 'power']);

/** Bereich des Signifikanzniveaus (gleich dem Literal im Schema). */
export const ALPHA_RANGE = Object.freeze({ min: 0.0001, max: 0.5 });
/** Bereich der Ziel-Power (gleich dem Literal im Schema). */
export const POWER_RANGE = Object.freeze({ min: 0.5, max: 0.9999 });

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    category: oneOf(['variance', 'mean'], { default: 'variance' }),
    testType: oneOf(['one', 'two'], { default: 'one' }),
    direction: oneOf(['two-sided', 'greater', 'less'], { default: 'two-sided' }),
    alpha: number({
      min: 0.0001, max: 0.5,
      // Aus dem Konfidenzniveau; auf den erlaubten Bereich geklemmt.
      default: (c) => Math.min(0.5, Math.max(0.0001, roundTo(1 - c.confidenceLevel / 100, 4))),
    }),
    power: number({
      min: 0.5, max: 0.9999,
      // Aus der Teststärke; auf den erlaubten Bereich geklemmt.
      default: (c) => Math.min(0.9999, Math.max(0.5, c.power / 100)),
    }),
    effect: object({
      varianceOne: object({
        sigma0: number({ nullable: true, exclusiveMin: 0 }),
        sigmaAlt: number({ nullable: true, exclusiveMin: 0 }),
      }),
      varianceTwo: object({
        ratio: number({ nullable: true, exclusiveMin: 0 }),
      }),
      mean: object({
        delta: number({ nullable: true, exclusiveMin: 0 }),
        sigma: number({ nullable: true, exclusiveMin: 0 }),
      }),
    }),
  },
  view: {
    powerCurveEdits: scatterChart.edits(),
  },
  derived: {
    /**
     * Die Felder, die im aktuellen Stand wirken: die gemeinsamen und die
     * Effektangaben der gewählten Variante (als Pfad unter `effect`).
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() {
      const id = variantOf(this.category, this.testType);
      return [...BASE_PARAMS, ...VARIANTS[id].params.map((k) => `effect.${id}.${k}`)];
    },
    /**
     * Der benötigte Stichprobenumfang mit Kennzahlen; `null`, solange eine
     * Effektangabe der gewählten Variante fehlt.
     *
     * @param {unknown} _src
     * @param {unknown} _d
     * @param {(key: string) => string} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(_src, _d, t) {
      const a = analyze(this);
      if (!a) return null;
      return {
        nRequired: a.nRequired,
        totalN: a.totalN,
        alpha: a.alpha,
        power: a.power,
        effectLabel: t(a.effectKey),
        effectValue: a.effectValue,
        algoId: a.algoId,
      };
    },
  },
}) {
  /**
   * Inhalt hat die Instanz, sobald eine Effektangabe steht; Kategorie,
   * Testtyp, Richtung, α und Power allein zählen nicht.
   * @returns {boolean}
   */
  hasContent() {
    return Object.values(this.effect).some((g) => Object.values(g).some((v) => v !== null));
  }
}
