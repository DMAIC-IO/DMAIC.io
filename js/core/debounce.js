/**
 * D.Mike — Entpreller (core/debounce.js)
 *
 * Eine Fassung von `fn`, die erst feuert, wenn `ms` lang kein weiterer Aufruf
 * kam. `cancel()` verwirft einen noch laufenden Timer, ohne ihn auszulösen.
 *
 * Das `cancel()` ist der eigentliche Grund für dieses Modul. Ein Entpreller
 * ohne Abbruch überlebt den Teardown seiner Komponente: Der Timer läuft in der
 * Ereignisschleife weiter, feuert Sekunden nach `destroy()` und schreibt den
 * Stand einer Komponente zurück, die es nicht mehr gibt — im Worksheet als
 * verwaister Zustandsdatensatz, im Histogramm in ein bereits neu gemountetes
 * SVG. Wer hier entprellt, ruft im `destroy()` `cancel()` auf.
 *
 * @param {Function} fn Aufzurufende Funktion.
 * @param {number} ms Ruhezeit in Millisekunden.
 * @returns {Function & { cancel: () => void }} Entprellte Fassung von `fn`.
 */
export function debounce(fn, ms) {
  let timer;
  const debounced = function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
  debounced.cancel = () => { clearTimeout(timer); timer = undefined; };
  return debounced;
}

export default debounce;
