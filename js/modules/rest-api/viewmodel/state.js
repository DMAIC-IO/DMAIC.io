/**
 * D.Mike — REST API: UI-State.
 *
 * Die letzte Antwort je Endpunkt (flüchtig, nie gespeichert), der Endpunkt
 * des laufenden Abrufs, je laufendem Zeitgeber sein Start und der letzte
 * Abruf, dazu eine Uhr, die die Anzeige „Letzter/Nächster Abruf“ alle 30 s
 * auffrischt. Die Zeitgeber selbst liegen in der Closure des `view`-Blocks.
 */
import { defineState, list, object, text, number, boolean } from '../../../core/model.js';

export const UiState = defineState({
  responses: list(object({
    endpointId: text(), status: number(), statusText: text(), ok: boolean(), body: text(),
  })),
  runningId: text({ nullable: true }),
  runs: list(object({ endpointId: text(), startedAt: number(), lastAt: number({ nullable: true }) })),
  clock: number(),
});
