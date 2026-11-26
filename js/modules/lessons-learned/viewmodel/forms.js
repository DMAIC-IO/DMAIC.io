/**
 * D.Mike — Lessons Learned: Formular einer Erfahrung.
 *
 * Ein Formular für Anlegen (`addLesson`) und Bearbeiten (`updateLesson`):
 * die Parameter der Kommandos, dazu das Eingabefeld einer neuen Maßnahme
 * (`actionText`), das kein Parameter ist. Die Maßnahmen-Liste ändern die
 * Knöpfe des Formulars (viewmodel.js `addDraftAction`/`removeDraftAction`).
 */
import { defineForm, text, oneOf, list, object, boolean } from '../../../core/model.js';

export const LessonForm = defineForm({
  fields: {
    title: text(),
    category: oneOf(['success', 'problem', 'improve'], { default: 'success' }),
    phase: text(),
    impact: oneOf(['high', 'medium', 'low'], { default: 'medium' }),
    owner: text(),
    description: text(),
    rootCause: text(),
    recommendation: text(),
    actions: list(object({ text: text(), done: boolean() })),
    actionText: text(),
  },
  fromParams(p) {
    return { ...p, actionText: '' };
  },
  toParams({ actionText: _draft, ...p }) {
    return p;
  },
});
