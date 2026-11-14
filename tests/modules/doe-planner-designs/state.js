/**
 * D.Mike — test helper for the doe-planner design-type modules.
 * Not a test file itself: the node runner only imports *.test.js.
 *
 * Builds a plain planner state with the members the design types read:
 * the stored fields, `getActiveTerms()` and `hasDuplicateFactorNames()`.
 */
import { activeTerms } from '../../../js/modules/doe-planner/domain/design.js';

/** @returns {object} the option defaults of a fresh planner */
function defaultOptions() {
  return {
    randomize: true,
    centerPoints: false,
    replicates: 1,
    alphaType: 'rotatable',
    ccdCenterPoints: 3,
    bbCenterPoints: 3,
    taguchiArray: '',
    optimalRuns: 0,
    optimalActiveTerms: null,
    forbiddenVertices: [],
  };
}

/**
 * Builds a planner state with named factors and responses.
 * @param {{factors?: Array<[string, string[], string?]>, responses?: string[], designType?: string, options?: object, selectedRes?: object, selectedPBIdx?: ?number}} [spec]
 * @returns {any}
 */
export function stateWith(spec = {}) {
  const {
    factors = [['A', ['-1', '1']], ['B', ['-1', '1']]],
    responses = ['Y'],
    designType = 'full',
    options = {},
    ...rest
  } = spec;
  const s = {
    doeName: '',
    designType,
    factors: factors.map(([name, levels, kind], i) => ({
      id: i + 1,
      name: name || '',
      unit: '',
      kind: kind === 'categorical' ? 'categorical' : 'continuous',
      levels: Array.isArray(levels) && levels.length >= 2 ? [...levels] : ['', ''],
    })),
    responses: responses.map((name) => ({ name, unit: '' })),
    options: { ...defaultOptions(), ...options },
    selectedRes: null,
    selectedPBIdx: null,
    design: null,
    previewEdits: null,
    worksheetRef: null,
    sourceWorksheet: null,
    getActiveTerms() { return activeTerms(this); },
    hasDuplicateFactorNames() {
      const names = this.factors.map((f) => f.name.trim().toLowerCase()).filter((n) => n !== '');
      return new Set(names).size !== names.length;
    },
  };
  Object.assign(s, rest);
  return s;
}

/** Environment without a source worksheet. */
export const NO_SOURCE = Object.freeze({ sourceRowCount: 0 });
