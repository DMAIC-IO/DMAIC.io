/**
 * D.Mike — Survey builder: UI state (viewmodel/state.js)
 *
 * Not stored: the selected section of the draft (the selected question is a
 * view field of the model), the rows of the condition editor before they
 * hold a source and an option, the expanded responses, the open ranking,
 * the free texts ticked for the VoC tree and a counter that renews the list
 * of Kano instances.
 */
import { defineState, list, object, text, boolean, number } from '../../../core/model.js';

export const UiState = defineState({
  selectedSectionId: text({ nullable: true }),
  conditionDraft: list(object({ key: text(), questionId: text(), optionIds: list(text()) })),
  expandedResponses: list(text()),
  rankingOpen: boolean(),
  vocSelected: list(text()),
  kanoRev: number({ integer: true }),
});
