/**
 * Dashboard tile registry.
 *
 * Each tile is a self-contained dashboard widget with metadata describing
 * its grid-size constraints and a render function. Tiles are addressed by
 * their `id` — only one instance per tile type may exist on the dashboard.
 */

/**
 * @typedef {object} DashboardTileDef
 * @property {string} id                - Unique tile identifier (kebab-case).
 * @property {string} i18nTitle         - i18n key for the tile title.
 * @property {number} defaultW          - Default grid width (columns).
 * @property {number} defaultH          - Default grid height (rows).
 * @property {number} minW              - Minimum grid width.
 * @property {number} minH              - Minimum grid height.
 */

/** @type {DashboardTileDef[]} */
export const DASHBOARD_TILES = [
  {
    id: 'zeg-timeline',
    i18nTitle: 'dashboard.zegTimeline',
    defaultW: 3, defaultH: 10, minW: 3, minH: 6,
  },
  {
    id: 'project-charter',
    i18nTitle: 'dashboard.charterTitle',
    defaultW: 3, defaultH: 10, minW: 2, minH: 6,
  },
  {
    id: 'project-goals',
    i18nTitle: 'dashboard.goalsTitle',
    defaultW: 3, defaultH: 10, minW: 2, minH: 6,
  },
  {
    id: 'voc-ctx-tree',
    i18nTitle: 'dashboard.vocTitle',
    defaultW: 3, defaultH: 10, minW: 2, minH: 6,
  },
  {
    id: 'org-chart',
    i18nTitle: 'dashboard.orgChartTitle',
    defaultW: 6, defaultH: 10, minW: 3, minH: 6,
  },
];

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

/**
 * Look up a tile definition by id.
 * @param {string} id
 * @returns {DashboardTileDef|null}
 */
export function getTileDef(id) {
  return DASHBOARD_TILES.find(t => t.id === id) || null;
}
