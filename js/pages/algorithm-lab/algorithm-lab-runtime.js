/**
 * D.Mike — Algorithm-Lab runtime (algorithm-lab-runtime.js)
 * Everything the Lab needs once it opens: registry, the two Alpine
 * components and the imperative mount. Loaded through createPage's `load`
 * hook as its own chunk, so lab-data.generated.js (~2.6 MB) stays out of the
 * start path. The shell (algorithm-lab.js) only wires button and overlay.
 */

import Alpine from '@alpinejs/csp';
import { LabRegistry } from '../../algorithm-lab/lab-registry.js';
import { updatePrismTheme } from '../../algorithm-lab/lab-renderer.js';
import { createLabComponent } from '../../algorithm-lab/lab-component.js';
import { createTryItComponent } from '../../algorithm-lab/lab-tryit-component.js';

// Shared registry for both components; the Lab is mounted once per session.
const registry = new LabRegistry();

/**
 * Alpine component factories registered by createPage under these names.
 * @type {Record<string, (ctx: {i18n: object, eventBus: object}) => object>}
 */
export const components = {
  algorithmLab: (ctx) =>
    createLabComponent({ registry, i18n: ctx.i18n, eventBus: ctx.eventBus }),
  labTryIt: (ctx) =>
    createTryItComponent({ registry, i18n: ctx.i18n, eventBus: ctx.eventBus }),
};

/**
 * Wire theme and navigation; the handle's navigate(algoId, tab) serves
 * app.js's lab:navigate routing.
 * @param {HTMLElement} el
 * @param {object} ctx
 */
export function mount(el, ctx) {
  const navigate = (algoId, tab = 'docs') => {
    const root = el.querySelector('[x-data="algorithmLab"]');
    if (root) Alpine.$data(root).navigate(algoId, tab);
  };
  const onTheme = (theme) => updatePrismTheme(theme);
  const onNavigate = (e) => navigate(e.algoId, e.tab);
  ctx.eventBus.on('theme:changed', onTheme);
  ctx.eventBus.on('lab:navigate', onNavigate);
  return { navigate, onTheme, onNavigate };
}

/**
 * @param {HTMLElement} _el
 * @param {object} ctx
 * @param {{onTheme: Function, onNavigate: Function}|null} handle
 */
export function unmount(_el, ctx, handle) {
  if (!handle) return;
  ctx.eventBus.off('theme:changed', handle.onTheme);
  ctx.eventBus.off('lab:navigate', handle.onNavigate);
}
