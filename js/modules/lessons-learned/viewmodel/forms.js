/**
 * D.Mike — Lessons Learned: Formular einer Erfahrung.
 *
 * Ein Formular für Anlegen (`addLesson`) und Bearbeiten (`updateLesson`):
 * die Parameter der Kommandos, dazu das Eingabefeld einer neuen Maßnahme
 * (`actionText`), das kein Parameter ist. Die Maßnahmen-Liste ändern die
 * Knöpfe des Formulars (viewmodel.js `addDraftAction`/`removeDraftAction`).
 * Steht beim Speichern noch Text im Maßnahmenfeld, hängt `toParams` ihn als
 * offene Maßnahme an — im selben Kommando, also ein Verlaufsschritt.
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
  toParams({ actionText, ...p }) {
    const draft = String(actionText ?? '').trim();
    if (draft === '') return p;
    return { ...p, actions: [...(p.actions ?? []), { text: draft, done: false }] };
  },
});
