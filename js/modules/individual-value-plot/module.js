/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'individual-value-plot',
  version: '2.0.0',
  icon: 'module.individual-value-plot',
  phase: 'data',
  group: 'visualize',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
