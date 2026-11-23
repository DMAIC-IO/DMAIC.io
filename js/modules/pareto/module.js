/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'pareto',
  version: '2.0.0',
  icon: 'module.pareto',
  phase: 'data',
  group: 'visualize',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
