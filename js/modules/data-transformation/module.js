/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'data-transformation',
  version: '1.1.0',
  icon: 'module.data-transformation',
  phase: 'data',
  group: 'process',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
