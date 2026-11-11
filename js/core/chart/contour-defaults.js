/** Vorgaben der Darstellung des Konturdiagramms (Typ `contour`). */

/**
 * Vorgaben der Editor-Einstellungen des Typs `contour`.
 * @type {Readonly<{numLevels: number, gridRes: number, colorScheme: string, showLines: boolean,
 *   showLabels: boolean, showDataPoints: boolean, markerSymbol: string, markerSize: number,
 *   markerColor: string, markerStroke: string, markerStrokeWidth: number, markerStrokeDash: string}>}
 */
export const CONTOUR_DEFAULTS = Object.freeze({
  numLevels: 10,
  gridRes: 100,
  colorScheme: 'viridis',
  showLines: true,
  showLabels: true,
  showDataPoints: false,
  markerSymbol: 'circle',
  markerSize: 10,
  markerColor: 'var(--color-text-primary)',
  markerStroke: 'var(--color-bg-primary)',
  markerStrokeWidth: 2,
  markerStrokeDash: 'solid',
});
