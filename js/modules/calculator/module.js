/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'calculator',
  version: '1.0.0',
  icon: 'module.calculator',
  phase: 'data',
  group: 'process',
  load: () => import('./viewmodel/viewmodel.js'),
};
