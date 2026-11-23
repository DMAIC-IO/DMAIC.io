/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'bar',
  version: '2.0.0',
  icon: 'module.bar',
  phase: 'data',
  group: 'visualize',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
