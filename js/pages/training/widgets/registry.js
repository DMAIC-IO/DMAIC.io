/**
 * D.Mike — Course widget implementations (widgets/registry.js)
 *
 * Maps every name of `WIDGETS` (widgets/index.js, Node-safe) to its Alpine
 * component. A unit test keeps both lists identical.
 */

import { samplingSimComponent } from './sampling-distribution.js';

/**
 * Widget name -> Alpine component name and factory.
 * @type {Object<string, {component: string, factory: (ctx: object) => object}>}
 */
export const WIDGET_COMPONENTS = {
  'sampling-distribution': { component: 'trainingSamplingSim', factory: samplingSimComponent },
};
