/**
 * Vorgaben für kind 'draw' (Spec C §5, C7): Ziel ist eine Viewmodel-Aktion
 * (`toAction`), kein Kommando; kein Tastaturmodus.
 */
export const draw = Object.freeze({
  /** @param {object} pos @returns {object} unverändert */
  clamp(pos) { return pos; },
});
