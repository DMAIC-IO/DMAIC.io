/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'unit-converter',
  version: '1.0.0',
  icon: 'module.unit-converter',
  phase: 'data',
  group: 'process',
  load: () => import('./viewmodel/viewmodel.js'),
};
