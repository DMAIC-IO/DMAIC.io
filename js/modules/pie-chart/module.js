/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'pie-chart',
  version: '2.0.0',
  icon: 'module.pie-chart',
  phase: 'data',
  group: 'visualize',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
