/**
 * D.Mike — C&E-Matrix: Rechnung über das Model.
 *
 * Reine Funktionen ohne Texte und ohne DOM: Bewertungsskalen, Zellschlüssel,
 * gewichtete Summen, die Prüfung gegen die aktive Skala, die Einträge des
 * Pareto-Diagramms und die Lage eines Werts im Farbverlauf.
 */

/** Bewertungsskalen: id → erlaubte Bewertungen (0–10 oder die Stufen 0/1/3/9, 0/3/7/10). */
export const RATING_SCALES = Object.freeze({
  '0-10': Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  '0-1-3-9': Object.freeze([0, 1, 3, 9]),
  '0-3-7-10': Object.freeze([0, 3, 7, 10]),
});

/** Die ids der Bewertungsskalen in Anzeigereihenfolge. */
export const SCALE_IDS = Object.freeze(Object.keys(RATING_SCALES));

/** Die Vorgabeskala. */
export const DEFAULT_SCALE = '0-10';

/** Die wählbaren Kundenwichtigkeiten, 1 bis 10. */
export const WEIGHTS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

/** Stopps des Farbverlaufs (grün → gelb → rot) als Anteil am Bereich. */
export const HEAT_STOPS = Object.freeze([0, 0.35, 0.55, 0.75, 1]);

/**
 * @typedef {object} MatrixLike
 * @property {ReadonlyArray<{ id: string, name: string }>} inputs
 * @property {ReadonlyArray<{ id: string, name: string, weight: number }>} outputs
 * @property {Readonly<Record<string, number>>} scores
 * @property {string} scale
 */

/**
 * Der Schlüssel einer Zelle in `scores`.
 * @param {string} inputId @param {string} outputId @returns {string}
 */
export function cellKey(inputId, outputId) {
  return `${inputId}:${outputId}`;
}

/**
 * Die erlaubten Bewertungen einer Skala; eine unbekannte id gilt als Vorgabeskala.
 * @param {string} scale @returns {readonly number[]}
 */
export function allowedScores(scale) {
  return RATING_SCALES[scale] ?? RATING_SCALES[DEFAULT_SCALE];
}

/**
 * Die Bewertung einer Zelle; ohne Eintrag 0.
 * @param {MatrixLike} m @param {string} inputId @param {string} outputId @returns {number}
 */
export function scoreOf(m, inputId, outputId) {
  return m.scores[cellKey(inputId, outputId)] ?? 0;
}

/**
 * Σ(Bewertung · Gewicht) über alle Ergebnisgrößen einer Eingangsgröße.
 * @param {MatrixLike} m @param {string} inputId @returns {number}
 */
export function rowSum(m, inputId) {
  let s = 0;
  for (const o of m.outputs) s += scoreOf(m, inputId, o.id) * o.weight;
  return s;
}

/**
 * Σ(Bewertung · Gewicht) über alle Eingangsgrößen einer Ergebnisgröße.
 * @param {MatrixLike} m @param {string} outputId @returns {number}
 */
export function colSum(m, outputId) {
  const o = m.outputs.find((x) => x.id === outputId);
  const w = o ? o.weight : 1;
  let s = 0;
  for (const i of m.inputs) s += scoreOf(m, i.id, outputId) * w;
  return s;
}

/**
 * Die Summe aller Zeilensummen.
 * @param {MatrixLike} m @returns {number}
 */
export function grandTotal(m) {
  let s = 0;
  for (const i of m.inputs) s += rowSum(m, i.id);
  return s;
}

/**
 * Liegt die gespeicherte Bewertung auf der aktiven Skala? Eine Zelle ohne Eintrag zählt als erlaubt.
 * @param {MatrixLike} m @param {string} inputId @param {string} outputId @returns {boolean}
 */
export function isOnScale(m, inputId, outputId) {
  const v = m.scores[cellKey(inputId, outputId)];
  return v === undefined || allowedScores(m.scale).includes(v);
}

/**
 * Die Zahl der gespeicherten Bewertungen der Matrix, die die aktive Skala nicht zulässt.
 * @param {MatrixLike} m @returns {number}
 */
export function offScaleCount(m) {
  let n = 0;
  for (const i of m.inputs) for (const o of m.outputs) if (!isOnScale(m, i.id, o.id)) n++;
  return n;
}

/**
 * Die Einträge des Pareto-Diagramms: je Eingangsgröße ihr Name (leer →
 * `Input <Position>`) und die Zeilensumme, nie unter 0.
 * @param {MatrixLike} m @returns {{ name: string, value: number }[]}
 */
export function paretoItems(m) {
  return m.inputs.map((inp, r) => ({
    name: (inp.name && String(inp.name).trim()) || `Input ${r + 1}`,
    value: Math.max(0, rowSum(m, inp.id) || 0),
  }));
}

/**
 * Die Lage eines Werts im Farbverlauf über den Bereich `[min, max]`: der
 * Abschnitt zwischen zwei Stopps (0 bis 3) und der Anteil darin. Ohne
 * Spannweite (`min === max`) `null`.
 * @param {number} value @param {number} min @param {number} max
 * @returns {{ segment: number, t: number }|null}
 */
export function heat(value, min, max) {
  if (max === min) return null;
  const ratio = (value - min) / (max - min);
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const a = HEAT_STOPS[i];
    const b = HEAT_STOPS[i + 1];
    if (ratio >= a && ratio <= b) return { segment: i, t: (ratio - a) / (b - a) };
  }
  return { segment: HEAT_STOPS.length - 2, t: 1 };
}
