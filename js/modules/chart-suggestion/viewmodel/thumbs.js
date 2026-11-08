/**
 * D.Mike — Diagramm-Vorschlag: Miniaturen der Karten.
 *
 * Einfarbige Miniaturen sind Masken-Icons (folgen `--color-accent`); die
 * Typen in `RAW_THUMBS` tragen Deckkraftstufen und werden roh gezeigt.
 */

/** Typen, deren Miniatur roh (mit eigener Deckkraft) gezeigt wird. */
export const RAW_THUMBS = new Set(['pie', 'mosaic', 'heatmap', 'bubble']);

/**
 * Typen mit eigener Miniatur `chart.<typ>`; jeder andere Typ fällt auf
 * `chart.generic` zurück, damit eine Karte nie leer bleibt.
 */
export const KNOWN_THUMBS = new Set([
  'bar', 'boxplot', 'bubble', 'control-chart', 'cusum', 'ewma', 'heatmap',
  'histogram', 'individual-value-plot', 'interaction-plot', 'main-effects',
  'mosaic', 'pareto', 'pie', 'probability-plot', 'run-chart', 'scatter',
  'scatter-marginal-boxplot', 'scatter-marginal-histogram', 'scatter-matrix',
]);

/** @type {Readonly<Record<string, string>>} Typen, die die Miniatur eines anderen Typs teilen. */
export const THUMB_ALIASES = Object.freeze({ 'transformed-imr-chart': 'control-chart' });

/**
 * Icon-Name der Miniatur eines Diagrammtyps. Der Name ist dynamisch: die
 * Abdeckung sichert `tools/build/chart-thumbs.test.mjs` gegen `icon-map.json`.
 * @param {string} type
 * @returns {string}
 */
export function thumbIcon(type) {
  const thumb = THUMB_ALIASES[type] || type;
  return `chart.${KNOWN_THUMBS.has(thumb) ? thumb : 'generic'}`;
}

/**
 * Wird die Miniatur roh gezeigt?
 * @param {string} type
 * @returns {boolean}
 */
export function thumbRaw(type) {
  return RAW_THUMBS.has(type);
}
