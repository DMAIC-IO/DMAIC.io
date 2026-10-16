/**
 * Helpers that render dashboard tiles through the real host
 * (js/pages/dashboard/tile-render.js) in the unit-test runner, which has no
 * build-inlined templates.
 */

import { renderTileSafely } from '../../js/pages/dashboard/tile-render.js';

/**
 * Fetch a tile template file and inline it as <template data-tpl="key">, once.
 * @param {string} key  template path relative to app/dev, e.g. 'js/modules/sipoc/sipoc.tile.html'
 */
export async function inlineTileTemplate(key) {
  const selector = `template[data-tpl="${CSS.escape(key)}"]`;
  if (document.querySelector(selector)) return;
  const res = await fetch(new URL(`../../${key}`, import.meta.url));
  if (!res.ok) throw new Error(`tile template not found: ${key}`);
  const html = await res.text();
  if (document.querySelector(selector)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', key);
  tpl.innerHTML = html;
  document.head.append(tpl);
}

/**
 * Render a tile the way the dashboard does; throws when the host shows the error placeholder.
 * @param {object} tile
 * @param {object} args  render args (tileId, instanceId, state, settings, i18n, …)
 * @param {HTMLElement} [host]
 * @returns {Promise<HTMLElement>} the host
 */
export async function mountTile(tile, args, host = document.createElement('div')) {
  if (tile.template) await inlineTileTemplate(tile.template);
  const ok = await renderTileSafely(tile, host, args, args.i18n);
  if (!ok) throw new Error(`tile "${args.tileId}" did not render`);
  return host;
}

/**
 * Poll until cond() is truthy (10 ms steps).
 * @param {function(): boolean} cond
 * @param {number} [tries]
 */
export async function waitFor(cond, tries = 100) {
  for (let i = 0; i < tries; i++) {
    if (cond()) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('waitFor: condition not met');
}
