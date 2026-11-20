/**
 * D.Mike — XY-Plot: Blasengrößen. Rein.
 */

const D_MIN = 6;
const D_MAX = 28;

/**
 * Blasendurchmesser (6 bis 28 px) aus Rohgrößen, Wurzel-Normierung.
 * @param {number[]} rawSizes
 * @param {string} label
 * @returns {{ sizes: number[], rawSizes: number[], label: string }}
 */
export function buildBubble(rawSizes, label) {
  const sqrtVals = rawSizes.map(Math.sqrt);
  const sMin = Math.min(...sqrtVals);
  const sMax = Math.max(...sqrtVals);
  const span = sMax - sMin;
  const sizes = sqrtVals.map((sv) => {
    const t = span > 0 ? (sv - sMin) / span : 0.5;
    return D_MIN + t * (D_MAX - D_MIN);
  });
  return { sizes, rawSizes, label };
}
