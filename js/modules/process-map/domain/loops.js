/**
 * D.Mike — Process Map: Loop-Bänder als reine Funktionen.
 *
 * Ein Loop führt von seinem Schritt (Quelle) zu einem früheren Schritt (Ziel)
 * zurück. Bildschirm und Bildexport zeichnen ihn als Band unter der
 * Output-Zeile; die Spalten der Schienen liefern die Funktionen hier, ohne
 * Messen. Ein Ziel, das fehlt oder nicht vor der Quelle liegt, lässt die
 * Schiene an der Quelle offen.
 */

/**
 * Liegt das Ziel vor der Quelle?
 * @param {ReadonlyArray<{ id: string }>} steps @param {number} sourceIdx
 * @param {string|null} targetStepId @returns {boolean}
 */
export function isTargetBefore(steps, sourceIdx, targetStepId) {
  if (!targetStepId) return false;
  const at = steps.findIndex((s) => s.id === targetStepId);
  return at >= 0 && at < sourceIdx;
}

/**
 * Schienen-Modifikatoren eines Bands, je Schrittspalte einer. Die Ansicht
 * macht daraus `pmap__loop-rail-cell--<modifikator>`.
 * @param {number} stepCount Zahl der Schrittspalten
 * @param {number} sourceIdx Index des Schritts mit dem Loop
 * @param {number} targetIdx Index des Ziels, −1 ohne Ziel
 * @returns {Array<''|'target'|'span'|'source'|'source-open'>}
 */
export function loopRailCells(stepCount, sourceIdx, targetIdx) {
  const cells = /** @type {Array<''|'target'|'span'|'source'|'source-open'>} */ (new Array(stepCount).fill(''));
  if (sourceIdx < 0 || sourceIdx >= stepCount) return cells;
  if (targetIdx < 0 || targetIdx >= sourceIdx) {
    cells[sourceIdx] = 'source-open';
    return cells;
  }
  cells[targetIdx] = 'target';
  for (let i = targetIdx + 1; i < sourceIdx; i++) cells[i] = 'span';
  cells[sourceIdx] = 'source';
  return cells;
}

/**
 * Spalten, in denen die Schiene eines Bands zu den Karten aufsteigt: gültiges Ziel und Quelle.
 * @param {number} stepCount @param {{ sourceIdx: number, targetIdx: number }} lane @returns {number[]}
 */
function loopVerticals(stepCount, { sourceIdx, targetIdx }) {
  if (sourceIdx < 0 || sourceIdx >= stepCount) return [];
  return targetIdx >= 0 && targetIdx < sourceIdx ? [targetIdx, sourceIdx] : [sourceIdx];
}

/**
 * Spalten, durch die ein Band die Schiene tieferer Bänder durchlässt. Die
 * Bänder liegen in der gegebenen Reihenfolge unter der Output-Zeile; Band j
 * bekommt die Senkrechten aller Bänder k > j.
 * @param {number} stepCount Zahl der Schrittspalten
 * @param {ReadonlyArray<{ sourceIdx: number, targetIdx: number }>} lanes Bänder von oben nach unten
 * @returns {number[][]} je Band die sortierten Durchlass-Spalten
 */
export function loopPassColumns(stepCount, lanes) {
  const verticals = lanes.map((lane) => loopVerticals(stepCount, lane));
  return lanes.map((_, j) => [...new Set(verticals.slice(j + 1).flat())].sort((a, b) => a - b));
}

/**
 * Spalten mit einer Pfeilspitze in die Karte darüber: je verschiedenem
 * gültigem Ziel eine, alle im obersten Band.
 * @param {number} stepCount Zahl der Schrittspalten
 * @param {ReadonlyArray<{ sourceIdx: number, targetIdx: number }>} lanes Bänder von oben nach unten
 * @returns {number[]} sortierte Zielspalten
 */
export function loopArrowColumns(stepCount, lanes) {
  const targets = lanes
    .filter(({ sourceIdx, targetIdx }) => sourceIdx < stepCount && targetIdx >= 0 && targetIdx < sourceIdx)
    .map(({ targetIdx }) => targetIdx);
  return [...new Set(targets)].sort((a, b) => a - b);
}

/**
 * Zweistellige Schrittnummer, wie Karte, Auswahl und Export sie zeigen.
 * @param {number} idx Index ab 0 @returns {string} `'01'`, `'02'`, …
 */
export function stepNumber(idx) {
  return String(idx + 1).padStart(2, '0');
}

/**
 * Optionen der Ziel-Auswahl eines Loops: alle Schritte vor der Quelle,
 * beschriftet „NN — Titel“, ohne Titel „<Schritt> NN“.
 * @param {ReadonlyArray<{ id: string, title: string }>} steps
 * @param {number} sourceIdx Index des Schritts mit dem Loop
 * @param {string} stepWord übersetztes Wort für „Schritt“
 * @returns {Array<{ id: string, label: string }>}
 */
export function loopTargetOptions(steps, sourceIdx, stepWord) {
  return steps.slice(0, Math.max(0, sourceIdx)).map((s, i) => ({
    id: s.id,
    label: s.title ? `${stepNumber(i)} — ${s.title}` : `${stepWord} ${stepNumber(i)}`,
  }));
}

/**
 * Die Bänder in Reihenfolge der Quellschritte, mit Index von Quelle und Ziel
 * (−1 ohne gültiges Ziel in der Liste).
 * @template {{ id: string, loop: { targetStepId: string|null }|null }} S
 * @param {ReadonlyArray<S>} steps
 * @returns {Array<{ step: S, sourceIdx: number, targetIdx: number }>}
 */
export function loopLanes(steps) {
  const lanes = [];
  steps.forEach((step, i) => {
    if (!step.loop) return;
    const targetIdx = step.loop.targetStepId ? steps.findIndex((s) => s.id === step.loop?.targetStepId) : -1;
    lanes.push({ step, sourceIdx: i, targetIdx });
  });
  return lanes;
}
