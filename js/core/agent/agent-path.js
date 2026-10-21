/**
 * D.Mike — Pfad-Hilfe der Agentenfläche (agent-path.js)
 *
 * `setParam` legt einen geprüften Wert unter einem Schlüssel ab, der auch
 * einen Punkt tragen darf (`'statParams.trim'`, `'tolerance.LSL'`). Diese
 * eine Hilfe stand vorher wörtlich in 24 Modulen. Der Generator
 * (`tools/build/agent-data.mjs`) liest sie über den benannten Import und
 * prüft ihren Körper genau wie eine lokale Kopie.
 */

/**
 * Einen Wert unter einem Punkt-Schlüssel (`'statParams.trim'`) in `obj` ablegen.
 * @param {object} obj Wurzel, deren Pfad beschrieben wird
 * @param {string} key Schlüssel, gegebenenfalls mit Punkt
 * @param {any} value der abzulegende Wert
 */
export function setAtPath(obj, key, value) {
  const parts = key.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}
