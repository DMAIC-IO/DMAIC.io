/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'random-generator',
  version: '1.1.0',
  icon: 'module.random-generator',
  phase: 'data',
  group: 'collect',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
