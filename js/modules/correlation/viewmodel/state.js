/**
 * D.Mike — Korrelation: UI-State der Matrix.
 *
 * Hover-Kreuz, gewählte Zelle und zugeklappte Streudiagramme. Nicht
 * gespeichert. Gilt nur, solange `stateSig` der Spaltenwahl gleicht (die
 * Schlüssel `<i>-<j>` hängen an Positionen); die gewählte Zelle zusätzlich
 * nur für den Koeffizienten, unter dem sie gewählt wurde.
 */
import { defineState, number, text, boolean, list } from '../../../core/model.js';

export const UiState = defineState({
  hoverRow: number({ integer: true, min: -1, default: -1 }),
  hoverCol: number({ integer: true, min: -1, default: -1 }),
  selectedPair: text({ nullable: true }),
  selectedMethod: text({ nullable: true }),
  collapsedPairs: list(text(), { default: [] }),
  allCollapsed: boolean({ default: false }),
  stateSig: text({ default: '' }),
});
