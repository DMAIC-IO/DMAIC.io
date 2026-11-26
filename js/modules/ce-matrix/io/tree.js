/**
 * D.Mike — C&E-Matrix Export: der JSON-Wert (für `exports.tree()`) in der
 * Form des Altexports, damit die Datei zeichengleich bleibt.
 */

/**
 * `{ inputs, outputs, scores, weights, scale }` mit Namen als Texten und
 * Bewertungen unter `"zeile-spalte"` (Positionen ab 0) in der gespeicherten
 * Reihenfolge; ein Schlüssel ohne Zeile oder Spalte entfällt.
 * @param {import('../domain/matrix.js').MatrixLike} m
 * @returns {{ inputs: string[], outputs: string[], scores: Record<string, number>, weights: number[], scale: string }}
 */
export function toLegacyJSON(m) {
  const row = new Map(m.inputs.map((i, r) => [i.id, r]));
  const col = new Map(m.outputs.map((o, c) => [o.id, c]));
  /** @type {Record<string, number>} */
  const scores = {};
  for (const [key, v] of Object.entries(m.scores)) {
    const at = key.indexOf(':');
    const r = row.get(key.slice(0, at));
    const c = col.get(key.slice(at + 1));
    if (r === undefined || c === undefined) continue;
    scores[`${r}-${c}`] = v;
  }
  return {
    inputs: m.inputs.map((i) => i.name),
    outputs: m.outputs.map((o) => o.name),
    scores,
    weights: m.outputs.map((o) => o.weight),
    scale: m.scale,
  };
}
