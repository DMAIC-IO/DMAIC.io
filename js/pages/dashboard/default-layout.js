/**
 * D.Mike — Default dashboard layout (default-layout.js)
 */

/**
 * Default layout used when a project has no persisted dashboard layout.
 * Mirrors the historical layout (timeline | charter | org chart wide).
 * @type {{tileId: string, x: number, y: number, w: number, h: number}[]}
 */
export const DEFAULT_DASHBOARD_LAYOUT = [
  { tileId: 'zeg-timeline',    x: 0, y: 0, w: 3, h: 10 },
  { tileId: 'project-charter', x: 3, y: 0, w: 3, h: 10 },
  { tileId: 'project-goals',   x: 6, y: 0, w: 3, h: 10 },
  { tileId: 'org-chart',       x: 9, y: 0, w: 3, h: 10 },
];
