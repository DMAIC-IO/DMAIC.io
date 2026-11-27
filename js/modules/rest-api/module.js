/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'rest-api',
  version: '1.0.0',
  icon: 'module.rest-api',
  phase: 'data',
  group: 'collect',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
  redact: () => import('./domain/redact.js'),
};
