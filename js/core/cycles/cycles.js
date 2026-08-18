/**
 * D.Mike — Cycle Definitions (cycles.js)
 * Single source of truth for all improvement / development cycles
 * (DMAIC, DMADV, 8D, … later: PDCA, IDOV).
 *
 * A cycle is an ordered list of methodology phases. The tile renderer wraps
 * this list with two virtual frame tiles: `data` (leading, phase-independent
 * tools) and `extras` (trailing, catch-all for tools without a cycle-specific
 * mapping). Both frame tiles exist in every cycle.
 *
 * Phase letters are normally a single character (D, M, A, …) but the tile
 * renderer also supports multi-character letters (e.g. 'D0' … 'D8' for the
 * 8D cycle) — the renderer adds a CSS modifier when `letter.length > 1`.
 *
 * See `.claude/V0.3-MULTI-CYCLE.md` for the design rationale.
 */

/**
 * @typedef {object} PhaseDef
 * @property {string} id          - Phase identifier (lowercase, kebab-case).
 * @property {string} letter      - Single-character display letter (e.g. 'D', 'M').
 * @property {string} i18nKey     - Translation key (e.g. 'phases.define').
 * @property {string} [color]     - Optional explicit hex color. If omitted, the
 *                                  CSS variable `--color-phase-<id>` is used as-is.
 * @property {boolean} [virtual]  - true for frame tiles (data, extras).
 * @property {'leading'|'trailing'} [position] - Frame tile placement.
 */

/**
 * @typedef {object} CycleDef
 * @property {string} id
 * @property {string} i18nKey         - Translation key for the cycle name / labels.
 * @property {PhaseDef[]} phases      - Methodology phases (without frame tiles).
 */

/** All known cycles, keyed by id. */
export const CYCLES = Object.freeze({
  dmaic: {
    id: 'dmaic',
    i18nKey: 'cycles.dmaic',
    phases: [
      { id: 'define',  letter: 'D', i18nKey: 'phases.define'  },
      { id: 'measure', letter: 'M', i18nKey: 'phases.measure' },
      { id: 'analyze', letter: 'A', i18nKey: 'phases.analyze' },
      { id: 'improve', letter: 'I', i18nKey: 'phases.improve' },
      { id: 'control', letter: 'C', i18nKey: 'phases.control' },
    ],
  },
  dmadv: {
    id: 'dmadv',
    i18nKey: 'cycles.dmadv',
    phases: [
      { id: 'define',  letter: 'D', i18nKey: 'phases.define'  },
      { id: 'measure', letter: 'M', i18nKey: 'phases.measure' },
      { id: 'analyze', letter: 'A', i18nKey: 'phases.analyze' },
      { id: 'design',  letter: 'D', i18nKey: 'phases.design', color: '#5e35b1' },
      { id: 'verify',  letter: 'V', i18nKey: 'phases.verify', color: '#00897b' },
    ],
  },
  eightd: {
    id: 'eightd',
    i18nKey: 'cycles.eightd',
    phases: [
      { id: 'prepare',        letter: 'D0', i18nKey: 'phases.prepare'        },
      { id: 'team',           letter: 'D1', i18nKey: 'phases.team'           },
      { id: 'problem',        letter: 'D2', i18nKey: 'phases.problem'        },
      { id: 'containment',    letter: 'D3', i18nKey: 'phases.containment'    },
      { id: 'rootcause',      letter: 'D4', i18nKey: 'phases.rootcause'      },
      { id: 'corrective',     letter: 'D5', i18nKey: 'phases.corrective'     },
      { id: 'implementation', letter: 'D6', i18nKey: 'phases.implementation' },
      { id: 'prevent',        letter: 'D7', i18nKey: 'phases.prevent'        },
      { id: 'recognize',      letter: 'D8', i18nKey: 'phases.recognize'      },
    ],
  },
});

/** Frame tiles, present in every cycle, framework-fixed. */
export const VIRTUAL_PHASES = Object.freeze({
  data:   { id: 'data',   letter: '▦', i18nKey: 'phases.data',   virtual: true, position: 'leading'  },
  extras: { id: 'extras', letter: '⋯', i18nKey: 'phases.extras', virtual: true, position: 'trailing' },
});

/** Default cycle for new projects and legacy (pre-0.3) imports. */
export const DEFAULT_CYCLE = 'dmaic';

/**
 * Look up a cycle by id. Falls back to the default cycle if the id is unknown
 * or falsy.
 * @param {string} cycleId
 * @returns {CycleDef}
 */
export function getCycle(cycleId) {
  return CYCLES[cycleId] ?? CYCLES[DEFAULT_CYCLE];
}

/**
 * Methodology phase ids of a cycle (without frame tiles `data` / `extras`).
 * Use this when computing achievement / training / DoD scopes.
 * @param {string} cycleId
 * @returns {string[]}
 */
export function getPhaseIds(cycleId) {
  return getCycle(cycleId).phases.map(p => p.id);
}

/**
 * Full ordered tile list for a cycle: leading `data` + methodology phases +
 * trailing `extras`. Use this for tile-rendering and state initialization.
 * @param {string} cycleId
 * @returns {string[]}
 */
export function getAllPhaseIds(cycleId) {
  return ['data', ...getPhaseIds(cycleId), 'extras'];
}

/**
 * Look up the full PhaseDef for a phase id within a cycle. Includes the
 * virtual frame tiles (`data`, `extras`), which resolve to the same definition
 * regardless of cycle.
 * @param {string} cycleId
 * @param {string} phaseId
 * @returns {PhaseDef|null}
 */
export function getPhaseDef(cycleId, phaseId) {
  if (phaseId === 'data')   return VIRTUAL_PHASES.data;
  if (phaseId === 'extras') return VIRTUAL_PHASES.extras;
  return getCycle(cycleId).phases.find(p => p.id === phaseId) ?? null;
}

/**
 * @param {string} cycleId
 * @param {string} phaseId
 * @returns {boolean} true if phaseId is a valid tile id (incl. `data` / `extras`)
 *                    for the given cycle.
 */
export function isValidPhase(cycleId, phaseId) {
  return getPhaseDef(cycleId, phaseId) !== null;
}
