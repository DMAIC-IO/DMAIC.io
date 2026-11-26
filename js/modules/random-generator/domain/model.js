/**
 * D.Mike — Zufallsgenerator: Model.
 *
 * Gespeichert sind die gewählte Verteilung, die Parameter je Verteilung,
 * Umfang und Startwert (stetig/diskret und attributiv getrennt) und die
 * Kategorien der attributiven Verteilung. Die erzeugten Werte sind nie
 * gespeichert: sie folgen deterministisch aus diesem Stand (`samplesOf`).
 * Ohne DOM, ohne i18n.
 */
import {
  defineModel, command, list, object, number, text, oneOf, idOf, unchecked, checkValue, fieldSpec,
} from '../../../core/model.js';
import { finiteOrNull } from '../../../core/agent/agent-results.js';
import { uid } from '../../../core/uid.js';
import { from0 } from './migrations.js';
import { PARAMS_SHAPE, ATTRIBUTIVE_KEY, isNumericDist } from './distributions.js';
import { samplesOf, summaryOf } from './sample.js';
import { targetList } from './targets.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';
import paretoChart from '../../../widgets/pareto-chart/schema.js';

/** Größter Umfang einer Stichprobe. */
export const MAX_COUNT = 100000;

/** Alle wählbaren Verteilungen; gleich `DIST_KEYS` aus distributions.js (Unit-Test). */
const DIST_KEY_LIST = [
  'normal', 'chisquare', 'f_dist', 't_dist', 'uniform', 'beta', 'cauchy', 'exponential',
  'gamma_dist', 'laplace', 'gumbel_max', 'logistic', 'loglogistic', 'lognormal', 'gumbel_min',
  'triangular', 'weibull', 'bernoulli', 'binomial', 'geometric', 'negbinomial', 'hypergeometric',
  'integer', 'poisson', 'mvnormal', 'attributive',
];

/**
 * Ersetzt die Parameter einer Verteilung im gespeicherten Stand (Reparatur).
 * @param {any} m @param {string} dist @param {Record<string, number>} values
 */
function repairParams(m, dist, values) {
  m._v.params = { ...m._v.params, [dist]: { ...m._v.params[dist], ...values } };
}

/**
 * Die Zusammenfassung der erzeugten Werte. Stetig/diskret: n bis kurtosis;
 * attributiv: n und frequency.
 *
 * @typedef {object} Generated
 * @property {number} n  Zahl der erzeugten Werte
 * @property {number|null} [mean]  Mittelwert
 * @property {number|null} [sd]  Standardabweichung
 * @property {number|null} [median]  Median
 * @property {number|null} [min]  kleinster Wert
 * @property {number|null} [max]  größter Wert
 * @property {number|null} [skewness]  Schiefe
 * @property {number|null} [kurtosis]  Kurtosis (Exzess)
 * @property {FrequencyRow[]} [frequency]  Häufigkeit je Kategorie
 */

/**
 * @typedef {object} FrequencyRow
 * @property {string} name  Kategorie
 * @property {number} count  Anzahl
 * @property {number} share  Anteil an allen erzeugten Werten (0–1)
 */

/**
 * @typedef {object} TargetColumn
 * @property {string} key  Ziel `instanceId|sheetId|columnId`
 * @property {string} name  Spaltenname bzw. Blattname beim Eintrag „neue Spalte“
 */

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** die gewählte Verteilung oder null */
    currentDist: oneOf(DIST_KEY_LIST, { nullable: true, default: null }),
    /** die Parameter je stetiger oder diskreter Verteilung */
    params: object(PARAMS_SHAPE),
    /** Umfang bei einer stetigen oder diskreten Verteilung */
    count: number({ integer: true, min: 1, max: 100000, default: 1000 }),
    /** Startwert bei einer stetigen oder diskreten Verteilung; leer heißt 42 */
    seed: number({ integer: true, nullable: true, default: 42 }),
    /** die Kategorien der attributiven Verteilung */
    attributes: list(object({
      id: text({ nonEmpty: true }),
      name: text(),
      weight: number({ min: 0 }),
    }), {
      default: [
        { id: 'a1', name: 'A', weight: 1 },
        { id: 'a2', name: 'B', weight: 2 },
        { id: 'a3', name: 'C', weight: 7 },
      ],
    }),
    /** Umfang bei der attributiven Verteilung */
    attrCount: number({ integer: true, min: 1, max: 100000, default: 50 }),
    /** Startwert bei der attributiven Verteilung; leer heißt 42 */
    attrSeed: number({ integer: true, nullable: true, default: 42 }),
  },
  view: {
    /** Editor-Einstellungen des Histogramms (stetig/diskret) */
    histogramEdits: histogramChart.edits(),
    /** Editor-Einstellungen des Pareto-Diagramms (attributiv) */
    paretoEdits: paretoChart.edits(),
  },
  invariants: {
    uniformOrder: {
      fields: ['params'],
      test(m) { return m.params.uniform.a <= m.params.uniform.b; },
      repair(m) {
        const { a, b } = m._v.params.uniform;
        repairParams(m, 'uniform', { a: b, b: a });
      },
    },
    triangularOrder: {
      fields: ['params'],
      test(m) { const { a, c, b } = m.params.triangular; return a <= c && c <= b; },
      repair(m) {
        const [a, c, b] = [m._v.params.triangular.a, m._v.params.triangular.c, m._v.params.triangular.b]
          .sort((x, y) => x - y);
        repairParams(m, 'triangular', { a, c, b });
      },
    },
    hyperK: {
      fields: ['params'],
      test(m) { return m.params.hypergeometric.K <= m.params.hypergeometric.N; },
      repair(m) { repairParams(m, 'hypergeometric', { K: m._v.params.hypergeometric.N }); },
    },
    hyperN: {
      fields: ['params'],
      test(m) { return m.params.hypergeometric.n <= m.params.hypergeometric.N; },
      repair(m) { repairParams(m, 'hypergeometric', { n: m._v.params.hypergeometric.N }); },
    },
    uniqueAttributeIds: {
      fields: ['attributes'],
      test(m) { return new Set(m.attributes.map((a) => a.id)).size === m.attributes.length; },
      repair(m) {
        const seen = new Set();
        m._v.attributes = m._v.attributes.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
      },
    },
  },
  commands: {
    addAttribute: command({
      returns: text(),
      run() {
        let id = uid();
        while (this.attributes.some((a) => a.id === id)) id = uid();
        this.attributes.push({ id, name: '', weight: 1 });
        return id;
      },
    }),
    removeAttribute: command({
      params: { attrId: idOf('attributes') },
      run({ attrId }) {
        this.attributes = this.attributes.filter((a) => a.id !== attrId);
      },
    }),
    setAttribute: command({
      params: { attrId: idOf('attributes'), key: oneOf(['name', 'weight']), value: unchecked() },
      run({ attrId, key, value }) {
        const item = fieldSpec(this, 'attributes').item.shape[key];
        const v = checkValue(item, 'value', value);
        this.attributes = this.attributes.map((a) => (a.id === attrId ? { ...a, [key]: v } : a));
      },
    }),
  },
  derived: {
    /**
     * Die Zusammenfassung der erzeugten Werte; null ohne Verteilung, ohne
     * gültige Kategorie oder wenn die Verteilung keine Werte erzeugen konnte.
     * @this {import('./model.types.js').StateModel}
     * @returns {Generated|null}
     */
    generated() {
      const s = summaryOf(samplesOf(this).values, this.currentDist === ATTRIBUTIVE_KEY);
      if (s === null || 'frequency' in s) return /** @type {Generated|null} */ (s);
      return /** @type {Generated} */ (Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'n' ? v : finiteOrNull(v)])));
    },
    /**
     * Die Pfade, die im aktuellen Stand wirken: die Parameter der gewählten
     * Verteilung, Umfang und Startwert; ohne Verteilung leer.
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() {
      if (this.currentDist === ATTRIBUTIVE_KEY) return ['attrCount', 'attrSeed'];
      if (!isNumericDist(this.currentDist)) return [];
      const dist = /** @type {string} */ (this.currentDist);
      return [...Object.keys(PARAMS_SHAPE[dist].shape).map((id) => `params.${dist}.${id}`), 'count', 'seed'];
    },
    /**
     * Die Ziele, die der Lauf `toWorksheet` annimmt: je Blatt mit einer leeren
     * Spalte seine leeren Spalten, danach ein Eintrag „neue Spalte“.
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @returns {TargetColumn[]}
     */
    targetColumns(src) {
      return targetList(src);
    },
  },
}) {
  /**
   * Inhalt hat der Generator, sobald eine Verteilung gewählt ist.
   * @returns {boolean}
   */
  hasContent() {
    return this.currentDist != null;
  }
}
