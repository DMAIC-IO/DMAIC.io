/**
 * D.Mike — MSA Typ 5: Kodierung der Bewertungen für den Messverlauf.
 */

/**
 * Eine Zahlenachse braucht eine Reihenfolge. Zahlen und binäre Studien bringen
 * sie mit (negativ < positiv, auch bei Textmarken); nominale Klassen haben
 * keine, also kein Messverlauf.
 * @param {Array<{ value: string }>|null} rows Zeilen der Analyse
 * @param {string} type 'binary' | 'nominal' | 'ordinal'
 * @param {{ positive: string|null, negative: string|null }} levels wirksame Stufen
 * @returns {{ kind: 'numeric' }|{ kind: 'binary', pos: string, neg: string }|null}
 */
export function gageRunEncoding(rows, type, levels) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  if (rows.every((r) => Number.isFinite(Number(r.value)))) return { kind: 'numeric' };
  if (type === 'binary') {
    const { positive: pos, negative: neg } = levels;
    if (pos != null && neg != null && rows.every((r) => r.value === pos || r.value === neg)) {
      return { kind: 'binary', pos, neg };
    }
  }
  return null;
}
