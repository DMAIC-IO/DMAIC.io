/**
 * D.Mike — Lessons Learned: UI-State.
 *
 * Kategorie-Filter, Suche und die aufgeklappten Karten — je Komponente, nie
 * gespeichert.
 */
import { defineState, oneOf, text, list } from '../../../core/model.js';

export const UiState = defineState({
  filter: oneOf(['all', 'success', 'problem', 'improve'], { default: 'all' }),
  search: text(),
  openCards: list(text()),
});
