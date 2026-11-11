/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'contour-plot',
  version: '2.0.0',
  icon: 'module.contour-plot',
  phase: 'data',
  group: 'visualize',
  load: () => import('./viewmodel/viewmodel.js'),
};
