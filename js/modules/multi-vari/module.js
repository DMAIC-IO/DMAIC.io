/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'multi-vari',
  version: '1.0.0',
  icon: 'module.multi-vari',
  phase: 'analyze',
  group: 'statistics',
  cycles: {
    dmaic: { phase: 'analyze', allowedPhases: ['measure', 'analyze'] },
    dmadv: { phase: 'analyze' },
    eightd: { phase: 'rootcause' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
