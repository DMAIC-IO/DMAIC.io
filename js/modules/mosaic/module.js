/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'mosaic',
  version: '2.0.0',
  icon: 'module.mosaic',
  phase: 'data',
  group: 'visualize',
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
