/**
 * D.Mike — Regelkarte für Variablen (I-MR, X̄-R, X̄-S): Model.
 *
 * Gespeichert werden Kartentyp, Untergruppengröße, Messwertspalte, Phase I,
 * Stufen, Spezifikationsgrenzen, die angehakten Nelson-Regeln, die
 * Anmerkungen je Punkt und die für Phase II eingefrorenen Grenzen. Ansicht:
 * die Editor-Einstellungen je Teilkarte (`charts`) und das Beispielblatt.
 * Ergebnis und Punkte liefern die Ableitungen aus Model und Arbeitsblatt; die
 * Engine läuft je wirksamer Änderung einmal (Merker in `analyze.js`).
 *
 * Anmerkungen und eingefrorene Grenzen schreibt der Agent nur über Kommandos:
 * das Setzen einer Anmerkung prüft den Punkt, das Einfrieren braucht die
 * gerechneten Grenzen, beides sieht nur die Ansicht über das Arbeitsblatt.
 * Kartentypen, Regeln und Untergruppenbereiche entsprechen der Engine
 * (`engines/control-chart-engine.js`); die Gleichheit sichert ein Unit-Test.
 */
import {
  defineModel, command, text, number, boolean, oneOf, list, map, object, columnRef,
} from '../../../core/model.js';
import { requireKnownId } from '../../../core/validate.js';
import { sourceColumns } from '../../../core/source-columns.js';
import controlChart from '../../../widgets/control-chart/schema.js';
import { inputsOf, analyze, resultOf, pointsOf } from './analyze.js';
import { from0 } from './migrations.js';

/** @typedef {import('./analyze.js').Result} Result */

/**
 * Erlaubte Untergruppengröße je Kartentyp (kleinste, größte): 1 bei I-MR,
 * 2 bis 10 bei X̄-R, 2 bis 25 bei X̄-S.
 * @type {Readonly<Record<'i-mr'|'xbar-r'|'xbar-s', readonly number[]>>}
 */
export const SUBGROUP_RANGE = Object.freeze({
  'i-mr': Object.freeze([1, 1]),
  'xbar-r': Object.freeze([2, 10]),
  'xbar-s': Object.freeze([2, 25]),
});

/**
 * Die Teilkarten mit eigenen Editor-Einstellungen (Schlüssel von `charts`):
 * I und MR (I-MR), X̄ und R (X̄-R), X̄ und S (X̄-S); X̄-R und X̄-S teilen `xbar`.
 */
export const CHART_KEYS = Object.freeze(['i', 'mr', 'xbar', 'r', 's']);

/**
 * Die Untergruppengröße `n`, geklemmt in den Bereich des Kartentyps.
 * @param {'i-mr'|'xbar-r'|'xbar-s'} chartTypeId
 * @param {number} n
 * @returns {number}
 */
export function clampSubgroup(chartTypeId, n) {
  const [lo, hi] = SUBGROUP_RANGE[chartTypeId];
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Die Rechnung zum Stand des Models.
 * @param {import('./model.types.js').StateModel} m
 * @param {import('../../../core/source-reader.js').Source} src
 * @returns {import('./analyze.js').Analysis|null}
 */
const analysisOf = (m, src) => analyze(inputsOf(m, sourceColumns(src)));

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    chartTypeId: oneOf(['i-mr', 'xbar-r', 'xbar-s']),
    subgroupSize: number({ integer: true, min: 1, max: 25, default: 1 }),
    columnRef: columnRef({ types: ['numeric'], minCount: 2, nullable: true }),
    baselineCount: number({ integer: true, min: 1, nullable: true }),
    stagesText: text(),
    usl: number({ nullable: true }),
    lsl: number({ nullable: true }),
    enabledRules: list(oneOf([1, 2, 3, 4, 5, 6, 7, 8]), { unique: true, sorted: true, default: [1] }),
    annotations: map(number({ integer: true, min: 0 }), object({ comment: text(), excluded: boolean() }), { agentWrite: false }),
    frozenLimits: object({
      chartTypeId: oneOf(['i-mr', 'xbar-r', 'xbar-s']),
      subgroupSize: number({ integer: true, min: 1 }),
      columnRef: columnRef({ nullable: true }),
      baselineEnd: number({ nullable: true }),
      primary: object({
        cl: number({ nullable: true }),
        ucl: number({ nullable: true }),
        lcl: number({ nullable: true }),
        sigma: number({ nullable: true }),
      }),
      secondary: object({
        cl: number({ nullable: true }),
        ucl: number({ nullable: true }),
        lcl: number({ nullable: true }),
        sigma: number({ nullable: true }),
      }),
      excludedIndices: list(number({ integer: true, min: 0 })),
    }, { nullable: true, agentWrite: false }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    charts: map(text(), controlChart.edits()),
  },
  invariants: {
    subgroupRange: {
      fields: ['subgroupSize', 'chartTypeId'],
      test(m) { return clampSubgroup(m.chartTypeId, m.subgroupSize) === m.subgroupSize; },
      repair(m) { m._v.subgroupSize = clampSubgroup(m._v.chartTypeId, m._v.subgroupSize); },
    },
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
     * Grenzen je Teilkarte (bei Stufen die der letzten Stufe), Fähigkeit,
     * Regelverletzungen der ersten Teilkarte und ob eingefrorene Grenzen
     * gelten; `null` ohne Spalte, bei einer nicht lesbaren Spalte, unter zwei
     * Werten oder bei einem Rechenfehler.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) {
      return resultOf(analysisOf(this, src));
    },
    /**
     * Je gezeichnetem Punkt der ersten Teilkarte die Werte und Grenzen beider
     * Teilkarten und ob der Punkt eine Regel verletzt. Leer ohne Ergebnis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Array<Object<string, number|boolean|null>>}
     */
    points(src) {
      return pointsOf(analysisOf(this, src));
    },
    /**
     * Die Spaltenfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['columnRef']; },
    /**
     * Die Einstellungen, die im aktuellen Stand wirken: die
     * Untergruppengröße nur bei X̄-R und X̄-S.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() {
      const xbar = this.chartTypeId !== 'i-mr';
      return ['chartTypeId', ...(xbar ? ['subgroupSize'] : []), 'baselineCount', 'stagesText', 'usl', 'lsl', 'enabledRules'];
    },
  },
  derivedBulk: ['points'],
  commands: {
    setChartType: command({
      params: { chartTypeId: oneOf(['i-mr', 'xbar-r', 'xbar-s']) },
      run({ chartTypeId }) {
        this.subgroupSize = clampSubgroup(chartTypeId, this.subgroupSize);
        this.chartTypeId = chartTypeId;
      },
    }),
    toggleRule: command({
      params: { ruleId: oneOf([1, 2, 3, 4, 5, 6, 7, 8]), on: boolean() },
      run({ ruleId, on }) {
        this.enabledRules = on ? [...this.enabledRules, ruleId] : this.enabledRules.filter((r) => r !== ruleId);
      },
    }),
    removeAnnotation: command({
      params: { index: number({ integer: true, min: 0 }) },
      run({ index }) {
        requireKnownId('index', index, Object.keys(this.annotations).map(Number));
        delete this.annotations[index];
      },
    }),
  },
});
