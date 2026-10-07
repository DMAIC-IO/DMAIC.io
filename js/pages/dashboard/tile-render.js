/**
 * D.Mike — Dashboard tile error boundary (tile-render.js)
 *
 * A tile whose render() throws (or rejects) shows a placeholder instead of
 * breaking the dashboard; the error goes to the console.
 */

import { h } from '../../core/dom.js';

/**
 * Render a module tile and contain its errors.
 * @param {{render: function}} tile
 * @param {HTMLElement} body  tile body element
 * @param {object} args  render args (tileId, instanceId, state, settings, i18n, theme, chartManager)
 * @param {{t: function}} i18n
 * @returns {Promise<boolean>} true when render() completed
 */
export async function renderTileSafely(tile, body, args, i18n) {
  try {
    await tile.render(body, args);
    return true;
  } catch (err) {
    console.error(`[dashboard] tile "${args.tileId}" failed to render`, err);
    body.replaceChildren(h('p', { class: 'dashboard-area__empty dashboard-area__tile-error' },
      i18n.t('dashboard.tileSettings.renderError')));
    return false;
  }
}
