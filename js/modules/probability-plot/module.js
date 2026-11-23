/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'probability-plot',
  version: '2.0.0',
  icon: 'module.probability-plot',
  phase: 'data',
  group: 'visualize',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
