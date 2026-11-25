/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'triz-resources',
  version: '0.1.0',
  icon: 'module.triz-resources',
  phase: 'improve',
  cycles: {
    eightd: { phase: 'corrective' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
