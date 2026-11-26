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
 * - `group`                    → section of the phase dropdown the entry lands in.
 *                                Label comes from `dataGroups.<group>` in i18n,
 *                                section order from `GROUP_ORDER` in `ui/dmaic-tiles.js`.
 *                                Entries without a group fall into "Sonstige".
 * - `cycles[<cycleId>]`        → primary phase + allowedPhases inside a cycle.
 *                                Modules without a mapping for the active cycle
 *                                land in the trailing `extras` tile.
 *
 * @type {Array<object>}
 */
export default [
  // ─── Daten-Bereich (cycle-independent) ────────────────────────
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
    id: 'voc-ctx-tree',
    phase: 'define',
    group: 'customer',
    singleton: true,
    allowedPhases: ['define'],
    load: () => import('./voc-ctx-tree/voc-ctx-tree.js'),
    loadTile: () => import('./voc-ctx-tree/voc-ctx-tree.tile.js'),
    cycles: {
      dmaic:  { phase: 'define',  allowedPhases: ['define']  },
      dmadv:  { phase: 'define',  allowedPhases: ['define']  },
      eightd: { phase: 'problem', allowedPhases: ['problem'] },
    },
  },
  {
    id: 'kano',
    phase: 'define',
    group: 'customer',
    allowedPhases: ['define'],
    load: () => import('./kano/kano.js'),
    loadTile: () => import('./kano/kano.tile.js'),
    cycles: {
      dmaic: { phase: 'define', allowedPhases: ['define'] },
      dmadv: { phase: 'define', allowedPhases: ['define'] },
    },
  },

  // ─── Measure ──────────────────────────────────────────────────
  {
    id: 'process-map',
    phase: 'measure',
    group: 'flowcharts',
    load: () => import('./process-map/process-map.js'),
    cycles: {
      dmaic:  { phase: 'measure' },
      dmadv:  { phase: 'measure' },
      eightd: { phase: 'problem', allowedPhases: ['problem', 'rootcause'] },
    },
  },
  {
    id: 'msa-typ1',
    phase: 'measure',
    group: 'msa',
    load: () => import('./msa-typ1/msa-typ1.js'),
    cycles: {
      dmaic:  { phase: 'measure' },
      dmadv:  { phase: 'measure' },
      eightd: { phase: 'problem' },
    },
  },
  {
    id: 'msa-typ4',
    phase: 'measure',
    group: 'msa',
    load: () => import('./msa-typ4/msa-typ4.js'),
    cycles: {
      dmaic:  { phase: 'measure' },
      dmadv:  { phase: 'measure' },
      eightd: { phase: 'problem' },
    },
  },
  {
    id: 'msa-typ6',
    phase: 'measure',
    group: 'msa',
    load: () => import('./msa-typ6/msa-typ6.js'),
    cycles: {
      dmaic:  { phase: 'measure' },
      dmadv:  { phase: 'measure' },
      eightd: { phase: 'problem' },
    },
  },

  // ─── Analyze ──────────────────────────────────────────────────
  {
    id: 'makigami',
    phase: 'analyze',
    group: 'flowcharts',
    load: () => import('./makigami/makigami.js'),
    cycles: {
      dmaic:  { phase: 'analyze'   },
      dmadv:  { phase: 'analyze'   },
      eightd: { phase: 'rootcause' },
    },
  },
  {
    id: 'activity-flowchart',
    phase: 'analyze',
    group: 'flowcharts',
    load: () => import('./activity-flowchart/activity-flowchart.js'),
    cycles: {
      dmaic:  { phase: 'analyze'   },
      dmadv:  { phase: 'analyze'   },
      eightd: { phase: 'rootcause' },
    },
  },
  {
    id: 'deployment-flowchart',
    phase: 'analyze',
    group: 'flowcharts',
    load: () => import('./deployment-flowchart/deployment-flowchart.js'),
    cycles: {
      dmaic:  { phase: 'analyze'   },
      dmadv:  { phase: 'analyze'   },
      eightd: { phase: 'rootcause' },
    },
  },
  {
    id: 'correlation',
    phase: 'analyze',
    group: 'statistics',
    load: () => import('./correlation/correlation.js'),
    cycles: {
      dmaic:  { phase: 'analyze' },
      dmadv:  { phase: 'analyze' },
      eightd: { phase: 'rootcause' },
    },
  },
  {
    id: 'attribute-test',
    phase: 'analyze',
    group: 'statistics',
    load: () => import('./attribute-test/attribute-test.js'),
    cycles: {
      dmaic:  { phase: 'analyze' },
      dmadv:  { phase: 'analyze',   allowedPhases: ['analyze', 'verify'] },
      eightd: { phase: 'rootcause', allowedPhases: ['rootcause', 'implementation'] },
    },
  },
  {
    id: 'sample-size',
    phase: 'analyze',
    group: 'statistics',
    load: () => import('./sample-size/sample-size.js'),
    cycles: {
      dmaic:  { phase: 'analyze' },
      dmadv:  { phase: 'analyze' },
      eightd: { phase: 'rootcause' },
    },
  },

  // ─── Improve (DMAIC) / Design (DMADV) ────────────────────────
  {
    id: 'doe-advisor',
    phase: 'improve',
    group: 'plan',
    load: () => import('./doe-advisor/doe-advisor.js'),
    cycles: {
      dmaic:  { phase: 'improve' },
      dmadv:  { phase: 'design'  },
      eightd: { phase: 'corrective' },
    },
  },
  {
    id: 'regression',
    phase: 'improve',
    group: 'evaluate',
    load: () => import('./regression/regression.js'),
    cycles: {
      dmaic:  { phase: 'improve' },
      dmadv:  { phase: 'design',     allowedPhases: ['design', 'verify'] },
      eightd: { phase: 'corrective', allowedPhases: ['rootcause', 'corrective'] },
    },
  },
  {
    id: 'glm-regression',
    phase: 'improve',
    group: 'evaluate',
    allowedPhases: ['analyze', 'improve'],
    load: () => import('./glm-regression/glm-regression.js'),
    cycles: {
      dmaic:  { phase: 'improve',    allowedPhases: ['analyze', 'improve'] },
      dmadv:  { phase: 'design',     allowedPhases: ['analyze', 'design', 'verify'] },
      eightd: { phase: 'corrective', allowedPhases: ['rootcause', 'corrective'] },
    },
  },
  {
    id: 'response-optimization',
    phase: 'improve',
    group: 'optimize',
    load: () => import('./response-optimization/response-optimization.js'),
    cycles: {
      dmaic:  { phase: 'improve' },
      dmadv:  { phase: 'design'  },
      eightd: { phase: 'corrective' },
    },
  },

  // ─── Extras (cycle-independent catch-all, trailing tile) ─────
  // Modules with cycles: {} land in the trailing extras tile (⋯) —
  // the registry's cycle-mapping check (`m.cycles?.[cycleId]`) returns
  // undefined for every cycle, so getByCycleAndPhase('extras') matches.
];
