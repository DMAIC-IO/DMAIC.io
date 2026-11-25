/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'triz-evolution-trends',
  version: '0.1.0',
  icon: 'module.triz-evolution-trends',
  phase: 'improve',
  cycles: {
    eightd: { phase: 'corrective' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
