/**
 * D.Mike — Dashboard tile lifecycle (tile-render.js)
 *
 * The single place where tiles are mounted and released. A tile provides a
 * template key and a viewModel(); the host clones the inlined template,
 * binds { vm } as Alpine scope and lets the optional mount() add imperative
 * parts (charts, hand-drawn SVG) into [data-tile-slot] elements. A failing
 * step shows a placeholder instead of breaking the dashboard; a render that
 * is superseded or disposed while its viewModel is pending is dropped.
 * This file is the tile contract: what a tile file exports is what it consumes.
 */

import Alpine from '@alpinejs/csp';
import { h, cloneTemplate, stripBlankText } from '../../core/dom.js';

/** Latest render token per tile body; a render whose token is no longer current is dropped. */
const renders = new WeakMap();

/**
 * Replace the body content with a fresh clone of the template, scoped to vm.
 * @param {HTMLElement} body
 * @param {string} key  inlined-template key
 * @param {object} vm
 */
function mountTemplate(body, key, vm) {
  Alpine.destroyTree(body);
  const fragment = document.createDocumentFragment();
  fragment.append(...cloneTemplate(key));
  stripBlankText(fragment);
  const nodes = [...fragment.children];
  body.replaceChildren(...nodes);
  for (const node of nodes) {
    Alpine.addScopeToNode(node, { vm });
    Alpine.initTree(node);
  }
}

/**
 * Call the tile's dispose and log instead of throwing.
 * @param {object|null|undefined} tile
 * @param {HTMLElement|null} body
 * @param {string} tileId
 */
function callDispose(tile, body, tileId) {
  try {
    tile?.dispose?.(body, { tileId });
  } catch (err) {
    console.error(`[dashboard] tile "${tileId}" failed to dispose`, err);
  }
}

/**
 * Render a module tile into its body and contain its errors.
 * @param {{template: string, viewModel: function, mount?: function, dispose?: function}} tile
 * @param {HTMLElement} body  tile body element
 * @param {object} args  tileId, instanceId, state, settings, i18n, theme, chartManager, stateManager
 * @param {{t: function}} i18n
 * @returns {Promise<boolean>} true when the tile was mounted; false on error or when the render was dropped
 */
export async function renderTileSafely(tile, body, args, i18n) {
  const token = {};
  renders.set(body, token);
  const stale = () => renders.get(body) !== token;
  try {
    const vm = await tile.viewModel(args);
    if (stale()) return false;
    mountTemplate(body, tile.template, vm);
    await tile.mount?.(body, vm, args);
    return true;
  } catch (err) {
    if (stale()) return false;
    console.error(`[dashboard] tile "${args.tileId}" failed to render`, err);
    callDispose(tile, body, args.tileId);
    Alpine.destroyTree(body);
    body.replaceChildren(h('p', { class: 'dashboard-area__empty dashboard-area__tile-error' },
      i18n.t('dashboard.tileSettings.renderError')));
    return false;
  }
}

/**
 * Release a tile: drop pending renders, run its dispose, destroy its Alpine scopes.
 * @param {object|null|undefined} tile
 * @param {HTMLElement|null} body
 * @param {{tileId: string}} opts
 */
export function disposeTile(tile, body, { tileId }) {
  if (body) renders.delete(body);
  callDispose(tile, body, tileId);
  if (body) Alpine.destroyTree(body);
}
