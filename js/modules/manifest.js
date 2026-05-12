/**
 * D.Mike — Module Manifest (manifest.js)
 * Maps module ids to their file paths and per-cycle phase placement.
 * The Module Registry reads this at startup and registers all entries.
 * Modules are lazy-loaded — only fetched when the user adds them.
 *
 * Per-entry shape:
 * - `phase: 'data'`            → cycle-independent tile (Daten-Bereich), no cycles map.
 * - `phase`, `allowedPhases`   → legacy top-level fields, kept for the
 *                                Module Registry's backwards-compat shim and
 *                                still consumed by `dmaic-tiles` / `workspace`
 *                                (refactor in v0.3 Schritt 4).
 * - `cycles[<cycleId>]`        → primary phase + allowedPhases inside a cycle.
 *                                Modules without a mapping for the active cycle
 *                                land in the trailing `extras` tile.
 *
 * @type {Array<object>}
 */
export default [
  // ─── Daten-Bereich (cycle-independent) ────────────────────────
  {
    id: 'worksheet',
    phase: 'data',
    group: 'collect',
    load: () => import('./worksheet/worksheet.js'),
  },
  {
    id: 'xy-plot',
    phase: 'data',
    group: 'visualize',
    load: () => import('./xy-plot/xy-plot.js'),
  },
  {
    id: 'pie-chart',
    phase: 'data',
    group: 'visualize',
    load: () => import('./pie-chart/pie-chart.js'),
  },
  {
    id: 'contour-plot',
    phase: 'data',
    group: 'visualize',
    load: () => import('./contour-plot/contour-plot.js'),
  },
  {
    id: 'histogram',
    phase: 'data',
    group: 'visualize',
    load: () => import('./histogram/histogram.js'),
  },
  {
    id: 'boxplot',
    phase: 'data',
    group: 'visualize',
    load: () => import('./boxplot/boxplot.js'),
  },
  {
    id: 'individual-value-plot',
    phase: 'data',
    group: 'visualize',
    load: () => import('./individual-value-plot/individual-value-plot.js'),
  },
  {
    id: 'run-chart',
    phase: 'data',
    group: 'visualize',
    load: () => import('./run-chart/run-chart.js'),
  },
  {
    id: 'probability-plot',
    phase: 'data',
    group: 'visualize',
    load: () => import('./probability-plot/probability-plot.js'),
  },
  {
    id: 'chart-suggestion',
    phase: 'data',
    group: 'visualize',
    // Internal companion to the Worksheet — instantiated programmatically
    // by the Worksheet toolbar's "Suggest chart" action. Hidden from the
    // module-add dropdown because the standalone empty-state is confusing.
    hiddenFromMenu: true,
    load: () => import('./chart-suggestion/chart-suggestion.js'),
  },
  {
    id: 'data-import',
    phase: 'data',
    group: 'collect',
    load: () => import('./data-import/data-import.js'),
  },
  {
    id: 'rest-api',
    phase: 'data',
    group: 'collect',
    load: () => import('./rest-api/rest-api.js'),
  },
  {
    id: 'random-generator',
    phase: 'data',
    group: 'collect',
    load: () => import('./random-generator/random-generator.js'),
  },
  {
    id: 'model-data-generator',
    phase: 'data',
    group: 'collect',
    load: () => import('./model-data-generator/model-data-generator.js'),
  },
  {
    id: 'calculator',
    phase: 'data',
    group: 'process',
    load: () => import('./calculator/calculator.js'),
  },
  {
    id: 'unit-converter',
    phase: 'data',
    group: 'process',
    load: () => import('./unit-converter/unit-converter.js'),
  },
  {
    id: 'data-transformation',
    phase: 'data',
    group: 'process',
    load: () => import('./data-transformation/data-transformation.js'),
  },

  // ─── Define ───────────────────────────────────────────────────
  {
    id: 'project-charter',
    phase: 'define',
    singleton: true,
    allowedPhases: ['define'],
    load: () => import('./project-charter/project-charter.js'),
    cycles: {
      dmaic: { phase: 'define', allowedPhases: ['define'] },
      dmadv: { phase: 'define', allowedPhases: ['define'] },
    },
  },
  {
    id: 'dmaic-calendar',
    phase: 'define',
    allowedPhases: ['define'],
    load: () => import('./dmaic-calendar/dmaic-calendar.js'),
    cycles: {
      dmaic: { phase: 'define', allowedPhases: ['define'] },
      dmadv: { phase: 'define', allowedPhases: ['define'] },
    },
  },
  {
    id: 'todo',
    phase: 'define',
    allowedPhases: ['define'],
    load: () => import('./todo/todo.js'),
    cycles: {
      dmaic: { phase: 'define', allowedPhases: ['define'] },
      dmadv: { phase: 'define', allowedPhases: ['define'] },
    },
  },
  {
    id: 'stakeholder-analysis',
    phase: 'define',
    allowedPhases: ['define'],
    load: () => import('./stakeholder-analysis/stakeholder-analysis.js'),
    cycles: {
      dmaic: { phase: 'define', allowedPhases: ['define'] },
      dmadv: { phase: 'define', allowedPhases: ['define'] },
    },
  },
  {
    id: 'voc-ctx-tree',
    phase: 'define',
    singleton: true,
    allowedPhases: ['define'],
    load: () => import('./voc-ctx-tree/voc-ctx-tree.js'),
    cycles: {
      dmaic: { phase: 'define', allowedPhases: ['define'] },
      dmadv: { phase: 'define', allowedPhases: ['define'] },
    },
  },
  {
    id: 'raci-matrix',
    phase: 'define',
    allowedPhases: ['define'],
    load: () => import('./raci-matrix/raci-matrix.js'),
    cycles: {
      dmaic: { phase: 'define', allowedPhases: ['define'] },
      dmadv: { phase: 'define', allowedPhases: ['define'] },
    },
  },
  {
    id: 'sipoc',
    phase: 'define',
    load: () => import('./sipoc/sipoc.js'),
    cycles: {
      dmaic: { phase: 'define' },
      dmadv: { phase: 'define' },
    },
  },
  {
    id: 'five-why',
    phase: 'define',
    load: () => import('./five-why/five-why.js'),
    cycles: {
      dmaic: { phase: 'define' },
      dmadv: { phase: 'define', allowedPhases: ['define', 'analyze'] },
    },
  },

  // ─── Measure ──────────────────────────────────────────────────
  {
    id: 'process-map',
    phase: 'measure',
    load: () => import('./process-map/process-map.js'),
    cycles: {
      dmaic: { phase: 'measure' },
      dmadv: { phase: 'measure' },
    },
  },
  {
    id: 'msa-typ1',
    phase: 'measure',
    load: () => import('./msa-typ1/msa-typ1.js'),
    cycles: {
      dmaic: { phase: 'measure' },
      dmadv: { phase: 'measure' },
    },
  },
  {
    id: 'msa-typ2',
    phase: 'measure',
    load: () => import('./msa-typ2/msa-typ2.js'),
    cycles: {
      dmaic: { phase: 'measure' },
      dmadv: { phase: 'measure' },
    },
  },
  {
    id: 'process-capability',
    phase: 'measure',
    load: () => import('./process-capability/process-capability.js'),
    cycles: {
      dmaic: { phase: 'measure' },
      dmadv: { phase: 'measure', allowedPhases: ['measure', 'verify'] },
    },
  },

  // ─── Analyze ──────────────────────────────────────────────────
  {
    id: 'ce-matrix',
    phase: 'analyze',
    load: () => import('./ce-matrix/ce-matrix.js'),
    cycles: {
      dmaic: { phase: 'analyze' },
      dmadv: { phase: 'analyze' },
    },
  },
  {
    id: 'ishikawa',
    phase: 'analyze',
    allowedPhases: ['measure', 'analyze', 'improve'],
    load: () => import('./ishikawa/ishikawa.js'),
    cycles: {
      dmaic: { phase: 'analyze', allowedPhases: ['measure', 'analyze', 'improve'] },
      dmadv: { phase: 'analyze', allowedPhases: ['measure', 'analyze', 'design'] },
    },
  },
  {
    id: 'correlation',
    phase: 'analyze',
    load: () => import('./correlation/correlation.js'),
    cycles: {
      dmaic: { phase: 'analyze' },
      dmadv: { phase: 'analyze' },
    },
  },
  {
    id: 'distribution-fit',
    phase: 'analyze',
    load: () => import('./distribution-fit/distribution-fit.js'),
    cycles: {
      dmaic: { phase: 'analyze' },
      dmadv: { phase: 'analyze' },
    },
  },
  {
    id: 'fmea',
    phase: 'analyze',
    load: () => import('./fmea/fmea.js'),
    cycles: {
      dmaic: { phase: 'analyze' },
      dmadv: { phase: 'analyze', allowedPhases: ['analyze', 'design'] },
    },
  },
  {
    id: 'hypothesis-test',
    phase: 'analyze',
    load: () => import('./hypothesis-test/hypothesis-test.js'),
    cycles: {
      dmaic: { phase: 'analyze' },
      dmadv: { phase: 'analyze', allowedPhases: ['analyze', 'verify'] },
    },
  },
  {
    id: 'sample-size',
    phase: 'analyze',
    load: () => import('./sample-size/sample-size.js'),
    cycles: {
      dmaic: { phase: 'analyze' },
      dmadv: { phase: 'analyze' },
    },
  },
  {
    id: 'pairwise-comparison',
    phase: 'analyze',
    load: () => import('./pairwise-comparison/pairwise-comparison.js'),
    cycles: {
      dmaic: { phase: 'analyze' },
      dmadv: { phase: 'analyze' },
    },
  },
  {
    id: 'outlier-test',
    phase: 'analyze',
    load: () => import('./outlier-test/outlier-test.js'),
    cycles: {
      dmaic: { phase: 'analyze' },
      dmadv: { phase: 'analyze' },
    },
  },

  // ─── Improve (DMAIC) / Design (DMADV) ────────────────────────
  {
    id: 'doe-advisor',
    phase: 'improve',
    group: 'plan',
    load: () => import('./doe-advisor/doe-advisor.js'),
    cycles: {
      dmaic: { phase: 'improve' },
      dmadv: { phase: 'design' },
    },
  },
  {
    id: 'doe-planner',
    phase: 'improve',
    group: 'plan',
    load: () => import('./doe-planner/doe-planner.js'),
    cycles: {
      dmaic: { phase: 'improve' },
      dmadv: { phase: 'design' },
    },
  },
  {
    id: 'regression',
    phase: 'improve',
    group: 'evaluate',
    load: () => import('./regression/regression.js'),
    cycles: {
      dmaic: { phase: 'improve' },
      dmadv: { phase: 'design', allowedPhases: ['design', 'verify'] },
    },
  },
  {
    id: 'glm-regression',
    phase: 'improve',
    group: 'evaluate',
    allowedPhases: ['analyze', 'improve'],
    load: () => import('./glm-regression/glm-regression.js'),
    cycles: {
      dmaic: { phase: 'improve', allowedPhases: ['analyze', 'improve'] },
      dmadv: { phase: 'design',  allowedPhases: ['analyze', 'design', 'verify'] },
    },
  },
  {
    id: 'response-optimization',
    phase: 'improve',
    group: 'optimize',
    load: () => import('./response-optimization/response-optimization.js'),
    cycles: {
      dmaic: { phase: 'improve' },
      dmadv: { phase: 'design' },
    },
  },

  // ─── Control (DMAIC) / Verify (DMADV) ────────────────────────
  {
    id: 'control-chart',
    phase: 'control',
    group: 'charts',
    allowedPhases: ['control'],
    load: () => import('./control-chart/control-chart.js'),
    cycles: {
      dmaic: { phase: 'control', allowedPhases: ['control'] },
      dmadv: { phase: 'verify',  allowedPhases: ['verify']  },
    },
  },
  {
    id: 'attribute-control-chart',
    phase: 'control',
    group: 'charts',
    allowedPhases: ['control'],
    load: () => import('./attribute-control-chart/attribute-control-chart.js'),
    cycles: {
      dmaic: { phase: 'control', allowedPhases: ['control'] },
      dmadv: { phase: 'verify',  allowedPhases: ['verify']  },
    },
  },
  {
    id: 'time-weighted-chart',
    phase: 'control',
    group: 'charts',
    allowedPhases: ['control'],
    load: () => import('./time-weighted-chart/time-weighted-chart.js'),
    cycles: {
      dmaic: { phase: 'control', allowedPhases: ['control'] },
      dmadv: { phase: 'verify',  allowedPhases: ['verify']  },
    },
  },
  {
    id: 'rare-event-chart',
    phase: 'control',
    group: 'charts',
    allowedPhases: ['control'],
    load: () => import('./rare-event-chart/rare-event-chart.js'),
    cycles: {
      dmaic: { phase: 'control', allowedPhases: ['control'] },
      dmadv: { phase: 'verify',  allowedPhases: ['verify']  },
    },
  },
  {
    id: 'multivariate-control-chart',
    phase: 'control',
    group: 'charts',
    allowedPhases: ['control'],
    load: () => import('./multivariate-control-chart/multivariate-control-chart.js'),
    cycles: {
      dmaic: { phase: 'control', allowedPhases: ['control'] },
      dmadv: { phase: 'verify',  allowedPhases: ['verify']  },
    },
  },
  {
    id: 'short-run-chart',
    phase: 'control',
    group: 'charts',
    allowedPhases: ['control'],
    load: () => import('./short-run-chart/short-run-chart.js'),
    cycles: {
      dmaic: { phase: 'control', allowedPhases: ['control'] },
      dmadv: { phase: 'verify',  allowedPhases: ['verify']  },
    },
  },
  {
    id: 'transformed-imr-chart',
    phase: 'control',
    group: 'charts',
    allowedPhases: ['control'],
    load: () => import('./transformed-imr-chart/transformed-imr-chart.js'),
    cycles: {
      dmaic: { phase: 'control', allowedPhases: ['control'] },
      dmadv: { phase: 'verify',  allowedPhases: ['verify']  },
    },
  },
  {
    id: 'lessons-learned',
    phase: 'control',
    allowedPhases: ['control'],
    load: () => import('./lessons-learned/lessons-learned.js'),
    cycles: {
      dmaic: { phase: 'control', allowedPhases: ['control'] },
      dmadv: { phase: 'verify',  allowedPhases: ['verify']  },
    },
  },

  // ─── Extras (cycle-independent catch-all, trailing tile) ─────
  // Modules with cycles: {} land in the trailing extras tile (⋯) —
  // the registry's cycle-mapping check (`m.cycles?.[cycleId]`) returns
  // undefined for every cycle, so getByCycleAndPhase('extras') matches.
  {
    id: 'triz-contradiction-matrix',
    phase: 'improve',
    load: () => import('./triz-contradiction-matrix/triz-contradiction-matrix.js'),
    cycles: {},
  },
  {
    id: 'triz-9-windows',
    phase: 'improve',
    load: () => import('./triz-9-windows/triz-9-windows.js'),
    cycles: {},
  },
];
