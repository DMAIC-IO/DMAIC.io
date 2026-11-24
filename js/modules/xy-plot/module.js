/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'xy-plot',
  version: '2.1.0',
  icon: 'module.xy-plot',
  phase: 'data',
  group: 'visualize',
  load: () => import('./viewmodel/viewmodel.js'),
};
