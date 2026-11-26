/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'pairwise-comparison',
  version: '1.0.0',
  icon: 'module.pairwise-comparison',
  phase: 'analyze',
  group: 'statistics',
  cycles: {
    dmaic: { phase: 'analyze' },
    dmadv: { phase: 'analyze' },
    eightd: { phase: 'rootcause' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
