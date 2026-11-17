/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'worksheet',
  version: '1.0.0',
  icon: 'module.worksheet',
  phase: 'data',
  group: 'collect',
  load: () => import('./viewmodel/viewmodel.js'),
};
