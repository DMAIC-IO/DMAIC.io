/**
 * D.Mike — DoE Planner: UI state (viewmodel/state.js)
 *
 * Not stored: the expanded term groups of an optimal design, the input of
 * a new forbidden factor combination (coded, one value per factor) and
 * the number of new runs for "extend design".
 */
import { defineState, list, number } from '../../../core/model.js';

export const UiState = defineState({
  termGroupExpanded: list(number({ integer: true })),
  forbiddenDraft: list(number({ nullable: true })),
  augmentRuns: number({ integer: true, min: 1, max: 200, default: 4 }),
});
