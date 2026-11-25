/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'triz-physical-contradiction',
  version: '0.1.0',
  icon: 'module.triz-physical-contradiction',
  phase: 'improve',
  cycles: {
    eightd: { phase: 'corrective' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
