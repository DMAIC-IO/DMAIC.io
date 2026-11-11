/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'data-import',
  version: '1.0.0',
  icon: 'module.data-import',
  phase: 'data',
  group: 'collect',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
