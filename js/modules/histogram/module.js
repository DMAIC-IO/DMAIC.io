/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'histogram',
  version: '2.0.0',
  icon: 'module.histogram',
  phase: 'data',
  group: 'visualize',
  load: () => import('./viewmodel/viewmodel.js'),
};
