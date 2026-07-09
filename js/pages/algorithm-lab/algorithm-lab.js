/**
 * D.Mike — Algorithm-Lab page (algorithm-lab.js)
 * Standard createPage host for the Algorithm Lab. The lab.html template is
 * owned by createPage (templateUrl → fetch → htmlFragment → initTree). The
 * Lab's two Alpine components (algorithmLab root + labTryIt) are registered
 * via the `components` hook before mount. mount() keeps only the imperative
 * bits: build the registry, wire theme/navigate, and return a handle exposing
 * navigate(algoId, tab) for app.js's lab:navigate routing.
 */

import { createPage } from '../../core/create-page.js';
import Alpine from '@alpinejs/csp';
import { LabRegistry } from '../../algorithm-lab/lab-registry.js';
import { updatePrismTheme } from '../../algorithm-lab/lab-renderer.js';
import { createLabComponent } from '../../algorithm-lab/lab-component.js';
import { createTryItComponent } from '../../algorithm-lab/lab-tryit-component.js';

// Shared registry + deps for both Lab components. Built once at module load;
// the Lab is mounted once per session (createPage caches the mount).
const registry = new LabRegistry();

const TEMPLATE_URL = new URL('js/algorithm-lab/lab.html', document.baseURI).href;

export default createPage({
  id: 'algorithm-lab',
  container: '#dev-area',
  button: '#dev-area-btn',
  overlay: 'dev-area',
  bodyClass: 'dev-area-open',
  i18nKey: 'devArea',
  templateUrl: TEMPLATE_URL,
  // The Lab's Alpine components update this.lang + refresh in place on
  // language:changed; createPage must not destroy+init the subtree (which would
  // reset the selected algorithm / active tab).
  ownsLangReactivity: true,

  components: {
    algorithmLab: (ctx) =>
      createLabComponent({ registry, i18n: ctx.i18n, eventBus: ctx.eventBus }),
    labTryIt: (ctx) =>
      createTryItComponent({ registry, i18n: ctx.i18n, eventBus: ctx.eventBus }),
  },

  mount(el, ctx) {
    const navigate = (algoId, tab = 'docs') => {
      const root = el.querySelector('[x-data="algorithmLab"]');
      if (root) Alpine.$data(root).navigate(algoId, tab);
    };

    const onTheme = (theme) => updatePrismTheme(theme);
    const onNavigate = (e) => navigate(e.algoId, e.tab);
    ctx.eventBus.on('theme:changed', onTheme);
    ctx.eventBus.on('lab:navigate', onNavigate);

    return { navigate, onTheme, onNavigate };
  },

  unmount(el, ctx, handle) {
    if (!handle) return;
    ctx.eventBus.off('theme:changed', handle.onTheme);
    ctx.eventBus.off('lab:navigate', handle.onNavigate);
  },
});
