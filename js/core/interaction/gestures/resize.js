/**
 * Vorgaben für kind 'resize' (Spec C §5): die Kante kommt aus `data-resize-edge`
 * am Griff (`'start'`, sonst `'end'`), der Rest der Position vom Modul.
 */
export const resize = Object.freeze({
  /** @param {object} pos @returns {object} unverändert */
  clamp(pos) { return pos; },
});

/**
 * `start(el)` des Moduls um die Kante ergänzen.
 * @param {(el: Element) => object} start
 * @returns {(el: Element) => object} mit `this` = Host aufzurufen
 */
export function withEdge(start) {
  return function startWithEdge(el) {
    return { ...start.call(this, el), edge: el.dataset.resizeEdge === 'start' ? 'start' : 'end' };
  };
}
