/**
 * D.Mike — Taschenrechner: UI-State.
 *
 * Die Anzeige, die das letzte Kommando hinterlassen hat: Zeile darüber,
 * Hauptzeile (nur Schlüssel und Zahlen) und der Stand, zu dem sie gehört.
 * Je Komponente, nie gespeichert; passt der Stand nicht mehr (Rückgängig,
 * Neuladen, Schreiben von außen), gilt die Anzeige beim Einhängen.
 */
import {
  defineState, object, oneOf, text, number, list, boolean,
} from '../../../core/model.js';

export const UiState = defineState({
  display: object({
    top: object({
      kind: oneOf(['none', 'expr', 'stat', 'ss']),
      text: text(),
      type: text(),
    }),
    main: object({
      kind: oneOf(['expr', 'zero', 'calc', 'stat', 'modes', 'percent', 'added', 'reason']),
      value: number({ nullable: true }),
      modes: list(number()),
      key: text(),
      error: boolean(),
    }),
    snap: object({
      expression: text(),
      lastResult: number({ nullable: true }),
      n: number(),
      nSS: number(),
      mode: text(),
    }),
  }, { nullable: true }),
});
