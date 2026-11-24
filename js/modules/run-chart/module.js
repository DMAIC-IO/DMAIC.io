/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'run-chart',
  version: '2.0.0',
  icon: 'module.run-chart',
  phase: 'data',
  group: 'visualize',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
