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
  // ─── Improve (DMAIC) / Design (DMADV) ────────────────────────
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
