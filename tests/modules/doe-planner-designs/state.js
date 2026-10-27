/**
 * D.Mike — test helper for the doe-planner design-type modules.
 * Not a test file itself: the node runner only imports *.test.js.
 */
import { State } from '../../../js/modules/doe-planner/doe-planner-model.js';

/**
 * Builds a State with named factors and responses.
 * @param {{factors?: Array<[string, string[], string?]>, responses?: string[], designType?: string, options?: object, selectedRes?: object, selectedPBIdx?: ?number}} [spec]
 * @returns {State}
 */
export function stateWith(spec = {}) {
  const {
    factors = [['A', ['-1', '1']], ['B', ['-1', '1']]],
    responses = ['Y'],
    designType = 'full',
    options = {},
    ...rest
  } = spec;
  const s = new State();
  for (const [name, levels, kind] of factors) s.addFactor(name, '', levels, kind);
  for (const name of responses) {
    s.addResponse();
    s.responses[s.responses.length - 1].name = name;
  }
  s.designType = designType;
  Object.assign(s.options, options);
  Object.assign(s, rest);
  return s;
}

/** Environment without a source worksheet. */
export const NO_SOURCE = Object.freeze({ sourceRowCount: 0 });
