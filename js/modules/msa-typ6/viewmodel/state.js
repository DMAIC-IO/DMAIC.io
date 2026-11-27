/**
 * D.Mike — MSA Typ 6: UI-State.
 *
 * Die Typ-1-Instanzen des Projekts für die Auswahl „Aus Typ-1-Instanz
 * übernehmen“ (gelesen über `ctx.instances`) und die zuletzt angeklickte
 * Zeile der Verletzungstabelle. Nicht gespeichert.
 */
import { defineState, list, object, text, number } from '../../../core/model.js';

export const UiState = defineState({
  typ1Options: list(object({ instanceId: text(), name: text(), mean: number(), stdDev: number() })),
  highlightedIndex: number({ integer: true, min: 0, nullable: true }),
});
