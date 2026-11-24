/**
 * D.Mike — Zeitgewichtete Regelkarten (EWMA, CUSUM): Model.
 *
 * Gespeichert werden der Kartentyp, die Messwertspalte, die σ-Schätzmethode,
 * die Länge der Phase I, Ziel- und σ-Vorgabe und die Parameter beider Typen
 * unter `params` (Regel M6: es wirken nur die des gewählten Typs, siehe
 * `activeParams`). Ansicht: die Editor-Einstellungen je Teilkarte (`charts`)
 * und das Beispielblatt. Ergebnis und Punkte liefern die Ableitungen aus Model
 * und Arbeitsblatt; die Engine läuft je Änderung einmal (Merker in
 * `analyze.js`).
 */
import { defineModel, text, number, oneOf, object, map, columnRef } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import controlChart from '../../../widgets/control-chart/schema.js';
import { CHART_TYPES, inputValues, inputsOf, analyze, resultOf, pointsOf } from './analyze.js';
import { from0 } from './migrations.js';

/** @typedef {import('./analyze.js').Result} Result */
/** @typedef {import('./analyze.js').EwmaPoint} EwmaPoint */
/** @typedef {import('./analyze.js').CusumPoint} CusumPoint */

/** Die Kartentypen (gleich dem Literal im Schema und den Schlüsseln von `CHART_TYPES`). */
export const CHART_TYPE_IDS = Object.freeze(['ewma', 'cusum']);

/** Die σ-Schätzmethoden der Phase I (gleich dem Literal im Schema). */
export const SIGMA_METHODS = Object.freeze(['mr', 'sd']);

/**
 * Die Teilkarten mit eigenen Editor-Einstellungen (Schlüssel von `charts`):
 * EWMA, CUSUM C⁺ und CUSUM C⁻.
 */
export const CHART_KEYS = Object.freeze(['ewma', 'cusum_plus', 'cusum_minus']);

/** Die Felder, die für beide Kartentypen wirken. */
const BASE_PARAMS = Object.freeze(['chartTypeId', 'sigmaMethod', 'baselineCount', 'targetOverride', 'sigmaOverride']);

/**
 * Die Rechnung zum Stand des Models.
 * @param {import('./model.types.js').StateModel} m
 * @param {import('../../../core/source-reader.js').Source} src
 * @returns {import('./analyze.js').Analysis|null}
 */
const analysisOf = (m, src) => analyze(inputsOf(inputValues(m, sourceColumns(src)), m));

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    chartTypeId: oneOf(['ewma', 'cusum'], { default: 'ewma' }),
    columnRef: columnRef({ types: ['numeric'], minCount: 3, nullable: true }),
    sigmaMethod: oneOf(['mr', 'sd'], { default: 'mr' }),
    baselineCount: number({ integer: true, min: 1, nullable: true }),
    targetOverride: number({ nullable: true }),
    sigmaOverride: number({ min: 0, nullable: true }),
    params: object({
      ewma: object({
        lambda: number({ exclusiveMin: 0, max: 1, default: 0.2 }),
        L: number({ exclusiveMin: 0, default: 3 }),
      }),
      cusum: object({
        kSigma: number({ exclusiveMin: 0, default: 0.5 }),
        hSigma: number({ exclusiveMin: 0, default: 4 }),
      }),
    }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    charts: map(text(), controlChart.edits()),
  },
  invariants: {
    chartKeys: {
      fields: ['charts'],
      test(m) { return Object.keys(m.charts).every((k) => CHART_KEYS.includes(k)); },
      repair(m) {
        const charts = /** @type {Record<string, unknown>} */ (m._v.charts);
        m._v.charts = Object.fromEntries(Object.entries(charts).filter(([k]) => CHART_KEYS.includes(k)));
      },
    },
  },
  derived: {
    /**
     * Ziel, σ und je Typ Grenzen bzw. h und k samt Signalpunkten; `null` ohne
     * Spalte, bei einer nicht lesbaren Spalte, unter drei Zahlen, mit σ nicht
     * größer 0 oder bei einem Rechenfehler.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) {
      return resultOf(analysisOf(this, src), this);
    },
    /**
     * Je verwertetem Wert die gezeichneten Größen: EWMA `{ ewma, ucl, lcl,
     * signal }`, CUSUM `{ cPlus, cMinus, signalHigh, signalLow }`; leer ohne
     * Ergebnis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Array<EwmaPoint|CusumPoint>}
     */
    points(src) {
      return pointsOf(analysisOf(this, src));
    },
    /**
     * Die Felder, die im aktuellen Stand wirken: die gemeinsamen und die
     * Parameter des gewählten Kartentyps (als Pfad unter `params`).
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() {
      const type = this.chartTypeId;
      return [...BASE_PARAMS, ...CHART_TYPES[type].params.map((k) => `params.${type}.${k}`)];
    },
    /**
     * Die Spaltenfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['columnRef']; },
  },
  derivedBulk: ['points'],
});
