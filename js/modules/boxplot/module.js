/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'boxplot',
  version: '2.0.0',
  icon: 'module.boxplot',
  phase: 'data',
  group: 'visualize',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
