/**
 * D.Mike — Korrelation: UI-State der Matrix.
 *
 * Hover-Kreuz, gewählte Zelle und zugeklappte Streudiagramme. Nicht
 * gespeichert. Eine andere Spaltenwahl leert ihn (die Schlüssel `<i>-<j>`
 * hängen an Positionen), ein Methodenwechsel die gewählte Zelle; `stateSig`
 * hält die Spaltenwahl, zu der er gilt.
 */
import { defineState, number, text, boolean, list } from '../../../core/model.js';

export const UiState = defineState({
  hoverRow: number({ integer: true, min: -1, default: -1 }),
  hoverCol: number({ integer: true, min: -1, default: -1 }),
  selectedPair: text({ nullable: true }),
  collapsedPairs: list(text(), { default: [] }),
  allCollapsed: boolean({ default: false }),
  stateSig: text({ default: '' }),
});
