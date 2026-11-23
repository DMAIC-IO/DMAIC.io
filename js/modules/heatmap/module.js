/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'heatmap',
  version: '2.0.0',
  icon: 'module.heatmap',
  phase: 'data',
  group: 'visualize',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
