/**
 * D.Mike — C&E-Matrix: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder matrix.js (das Schema darf sich ändern, die
 * Migration nicht).
 */

/** Skalen im Formatstand 1.0. */
const SCALES_1_0 = ['0-10', '0-1-3-9', '0-3-7-10'];

/** Zellschlüssel der Altform: `zeile-spalte`, Nummern ab 0 ohne führende Null. */
const LEGACY_KEY = /^(0|[1-9]\d*)-(0|[1-9]\d*)$/;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Ein Altname: Text bleibt wörtlich, eine Zahl wird ihr Text, alles andere
 * der leere Text (die Altform zeigte die Zeile leer und rechnete sie mit).
 * @param {unknown} v @returns {string}
 */
const nameOf = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/**
 * Ein Altgewicht wie das alte `clampWeight`: `parseInt`, Unlesbares → 1, auf 1..10 geklemmt.
 * @param {unknown} w @returns {number}
 */
function clampWeight(w) {
  const n = parseInt(/** @type {any} */ (w), 10);
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(10, n));
}

/**
 * Ein Altwert einer Bewertung: eine endliche Zahl bleibt, ein nicht leerer
 * Text, den `Number()` endlich liest, wird diese Zahl; sonst `null` (entfällt).
 * @param {unknown} v @returns {number|null}
 */
function scoreValue(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (wie ihn das alte `State.toJSON`
 * schrieb, von Hand oder als Beispieldatei). Eingangs- und Ergebnisgrößen
 * werden Objekte mit fester id aus der Position (`i1`, `i2`, … bzw. `o1`,
 * `o2`, …), damit ein nie gespeicherter Stand bei jedem Lesen dieselben ids
 * zeigt; ohne Liste gilt die Altvorgabe (drei Einträge). Das Gewicht wandert
 * in die Spalte (fehlend → 1, überzählige entfallen). Die Bewertungen ziehen
 * von `zeile-spalte` auf `<input-id>:<output-id>` um, nach Zeile und Spalte
 * geordnet; fremde und verwaiste Schlüssel und unlesbare Werte entfallen,
 * Werte außerhalb der Skala bleiben. Eine unbekannte Skala wird `0-10`.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {{ inputs: { id: string, name: string }[], outputs: { id: string, name: string, weight: number }[], scores: Record<string, number>, scale: string }}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  const inNames = Array.isArray(o.inputs) ? o.inputs.map(nameOf) : ['Input 1', 'Input 2', 'Input 3'];
  const outNames = Array.isArray(o.outputs) ? o.outputs.map(nameOf) : ['Output 1', 'Output 2', 'Output 3'];
  const weights = Array.isArray(o.weights) ? o.weights : [];
  const inputs = inNames.map((name, r) => ({ id: `i${r + 1}`, name }));
  const outputs = outNames.map((name, c) => ({
    id: `o${c + 1}`, name, weight: c < weights.length ? clampWeight(weights[c]) : 1,
  }));
  /** @type {[number, number, number][]} */
  const cells = [];
  if (isObject(o.scores)) {
    for (const [key, raw] of Object.entries(o.scores)) {
      const hit = LEGACY_KEY.exec(key);
      if (!hit) continue;
      const r = Number(hit[1]);
      const c = Number(hit[2]);
      const v = scoreValue(raw);
      if (r >= inputs.length || c >= outputs.length || v === null) continue;
      cells.push([r, c, v]);
    }
  }
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  /** @type {Record<string, number>} */
  const scores = {};
  for (const [r, c, v] of cells) scores[`${inputs[r].id}:${outputs[c].id}`] = v;
  const scale = typeof o.scale === 'string' && SCALES_1_0.includes(o.scale) ? o.scale : '0-10';
  return { inputs, outputs, scores, scale };
}
