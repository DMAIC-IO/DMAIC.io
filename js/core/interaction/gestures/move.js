/**
 * Vorgaben für kind 'move' (Spec C §5): Position, `locate` und `step`
 * bestimmt das Modul; der Kern begrenzt nichts.
 */
export const move = Object.freeze({
  /** @param {object} pos @returns {object} unverändert */
  clamp(pos) { return pos; },
});
