/**
 * D.Mike — Attributive Regelkarte: Grenzen als Liste.
 *
 * Die Engine liefert eine Grenze als Zahl (konstant) oder als Liste (je Punkt);
 * das Regelkarten-Widget nimmt immer eine Liste.
 */

/**
 * Grenze als Liste: ein Einzelwert gilt für alle Punkte.
 * @param {number|number[]} v
 * @returns {number[]}
 */
export function asList(v) {
  return Array.isArray(v) ? v : [v];
}
