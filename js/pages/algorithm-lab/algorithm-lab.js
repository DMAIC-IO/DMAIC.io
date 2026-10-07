/**
 * D.Mike — Algorithm-Lab page (algorithm-lab.js)
 * Thin createPage shell: button, Escape, overlay and language wiring work
 * without the Lab code. The registry, components and mount live in
 * algorithm-lab-runtime.js and load on first open (own chunk).
 */

import { createPage } from '../../core/create-page.js';

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
  load: () => import('./algorithm-lab-runtime.js'),
});
