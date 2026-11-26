/**
 * D.Mike — Stoff-Feld-Analyse (TRIZ): UI-State.
 *
 * Die Standardklassen, die eine Instanz ohne gespeicherten Aufklappstand beim
 * Einhängen offen zeigt (die empfohlenen der Diagnose). Je Komponente, nie
 * gespeichert; das erste Auf- oder Zuklappen übernimmt den sichtbaren Stand
 * ins Model und leert die Liste.
 */
import { defineState, list, number } from '../../../core/model.js';

export const UiState = defineState({
  autoOpen: list(number({ integer: true })),
});
