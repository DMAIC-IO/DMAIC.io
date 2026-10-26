/**
 * D.Mike — Kano chart config (kano-chart.js)
 *
 * Better/Worse scatter config shared by the Kano module and its dashboard
 * tile. Pure: no DOM, no i18n (the size label is passed in as text).
 */

/**
 * Bubble diameter from the mean importance: 10 px (w̄ = 1) to 26 px (w̄ = 9).
 * Items without importance get 10 px — never 0, because the scatter type
 * renders sizes[i] <= 0 invisible.
 * @param {{importanceMean: number|null}[]} rows
 * @returns {number[]}
 */
export function bubbleSizes(rows) {
  return rows.map((r) => {
    if (r.importanceMean === null) return 10;
    return 10 + ((r.importanceMean - 1) / 8) * 16;
  });
}

/**
 * Series and reference lines of the Better/Worse diagram. One series per item
 * (not one series with many points): the scatter type uses the series name as
 * tooltip head. Rows without cs or ds are left out.
 * @param {object[]} rows - rows of evaluate()
 * @param {{importance: boolean, sizeLabel: string}} opts
 * @returns {{series: object[], refLines: object[]}}
 */
export function kanoScatterConfig(rows, { importance, sizeLabel }) {
  const plotted = (rows || []).filter((r) => r.cs !== null && r.ds !== null);
  const sizes = importance ? bubbleSizes(plotted) : null;
  const series = plotted.map((r, i) => {
    const s = {
      name: r.label,
      color: 'var(--color-chart-1)',
      symbol: 'circle',
      markerSize: 8,
      strokeWidth: 1,
      x: [Math.abs(r.ds)],
      y: [r.cs],
    };
    if (importance) {
      s.sizes = [sizes[i]];
      s.sizeValues = [r.importanceMean];
      s.sizeLabel = sizeLabel;
    }
    return s;
  });
  return {
    series,
    refLines: [
      { dir: 'h', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
      { dir: 'v', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
    ],
  };
}
