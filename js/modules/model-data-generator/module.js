/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'model-data-generator',
  version: '1.1.0',
  icon: 'module.model-data-generator',
  phase: 'data',
  group: 'collect',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
