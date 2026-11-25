/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'triz-ifr',
  version: '0.1.0',
  icon: 'module.triz-ifr',
  phase: 'improve',
  cycles: {
    eightd: { phase: 'corrective' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
