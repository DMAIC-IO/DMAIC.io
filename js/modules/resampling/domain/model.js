/**
 * D.Mike — Resampling: Model.
 *
 * Gespeichert werden Einstellungen und das zuletzt gerechnete Ergebnis;
 * gerechnet wird im Viewmodel über einen asynchronen Ablauf.
 */
import { defineModel, command, text, number, boolean, oneOf, list, object, columnRef } from '../../../core/model.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';
import { from0 } from './migrations.js';

/** @type {readonly ('one'|'two'|'paired'|'k')[]} */
export const MODES = Object.freeze(['one', 'two', 'paired', 'k']);
/** @type {readonly ('difference'|'ratio')[]} */
export const CONTRASTS = Object.freeze(['difference', 'ratio']);
/** @type {readonly ('two-sided'|'greater'|'less')[]} */
export const DIRECTIONS = Object.freeze(['two-sided', 'greater', 'less']);
/** @type {readonly ('bca'|'percentile')[]} */
export const CI_METHODS = Object.freeze(['bca', 'percentile']);
export const SEED_MAX = 2147483647;
/** Alle Statistiken (gleich der Engine). */
export const STATISTIC_IDS = Object.freeze(['mean', 'median', 'stddev', 'variance', 'trimmedMean', 'quantile', 'cv', 'ppk']);
/** Erlaubte Statistiken je Aufbau. */
export const STATS_BY_MODE = Object.freeze({
  one: STATISTIC_IDS,
  two: STATISTIC_IDS,
  paired: Object.freeze(['mean', 'median', 'trimmedMean']),
  k: Object.freeze(STATISTIC_IDS.filter((id) => id !== 'ppk')),
});

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    mode: oneOf(['one', 'two', 'paired', 'k']),
    statisticId: oneOf(['mean', 'median', 'stddev', 'variance', 'trimmedMean', 'quantile', 'cv', 'ppk']),
    statParams: object({
      trim: number({ min: 0, exclusiveMax: 0.5, default: 0.1 }),
      p: number({ exclusiveMin: 0, exclusiveMax: 1, default: 0.95 }),
      lsl: text(),
      usl: text(),
    }),
    contrast: oneOf(['difference', 'ratio']),
    direction: oneOf(['two-sided', 'greater', 'less']),
    target: text(),
    colRef1: columnRef({ types: ['numeric'], minCount: 2 }),
    colRef2: columnRef({ types: ['numeric'], minCount: 2 }),
    colRefsK: list(columnRef({ types: ['numeric'], minCount: 2, nullable: false })),
    B: number({ integer: true, exclusiveMin: 0, default: 10000 }),
    seed: number({ integer: true, min: 0, max: 2147483647, default: 42 }),
    confidence: number({ exclusiveMin: 0, exclusiveMax: 1, default: 0.95 }),
    ciMethod: oneOf(['bca', 'percentile']),
    result: object({
      inputsHash: text(),
      mode: oneOf(['one', 'two', 'paired', 'k']),
      statisticId: oneOf(['mean', 'median', 'stddev', 'variance', 'trimmedMean', 'quantile', 'cv', 'ppk']),
      contrast: oneOf(['difference', 'ratio']),
      direction: oneOf(['two-sided', 'greater', 'less']),
      confidence: number(),
      B: number(),
      seed: number(),
      labels: list(text()),
      n: list(number()),
      boot: object({
        estimate: number({ nullable: true }),
        se: number({ nullable: true }),
        bias: number({ nullable: true }),
        ci: object({ percentile: list(number({ nullable: true }), { nullable: true }), bca: list(number({ nullable: true }), { nullable: true }), bcaFallback: boolean() }),
        bins: list(object({ x0: number(), x1: number(), count: number() })),
      }, { nullable: true }),
      perm: object({
        observed: number({ nullable: true }),
        pValue: number({ nullable: true }),
        exact: boolean(),
        permutations: number(),
        bins: list(object({ x0: number(), x1: number(), count: number() })),
      }, { nullable: true }),
      k: object({
        estimate: number({ nullable: true }),
        observed: number({ nullable: true }),
        pValue: number({ nullable: true }),
        exact: boolean(),
        permutations: number(),
        bins: list(object({ x0: number(), x1: number(), count: number() })),
        groups: list(object({ estimate: number({ nullable: true }), ci: object({ percentile: list(number({ nullable: true }), { nullable: true }), bca: list(number({ nullable: true }), { nullable: true }), bcaFallback: boolean() }) })),
        posthoc: list(object({ i: number(), j: number(), contrast: number({ nullable: true }), ci: object({ percentile: list(number({ nullable: true }), { nullable: true }), bca: list(number({ nullable: true }), { nullable: true }), bcaFallback: boolean() }), pRaw: number({ nullable: true }), pHolm: number({ nullable: true }), exact: boolean() })),
      }, { nullable: true }),
    }, { nullable: true }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    bootChartEdits: histogramChart.edits(),
    permChartEdits: histogramChart.edits(),
  },
  invariants: {
    statisticForMode: {
      fields: ['statisticId', 'mode'],
      test(m) {
        const allowed = m.mode === 'paired' ? ['mean', 'median', 'trimmedMean']
          : m.mode === 'k' ? ['mean', 'median', 'stddev', 'variance', 'trimmedMean', 'quantile', 'cv']
            : ['mean', 'median', 'stddev', 'variance', 'trimmedMean', 'quantile', 'cv', 'ppk'];
        return allowed.includes(m.statisticId);
      },
    },
  },
  commands: {
    setMode: command({
      params: { mode: oneOf(['one', 'two', 'paired', 'k']) },
      run({ mode }) {
        if (!STATS_BY_MODE[mode].includes(this.statisticId)) this.statisticId = 'mean';
        this.mode = mode;
      },
    }),
    rollSeed: command({
      params: {},
      returns: number({ integer: true }),
      run() {
        this.seed = Math.min(2147483647, 1 + Math.floor(Math.random() * 2147483647));
        return this.seed;
      },
    }),
  },
});
