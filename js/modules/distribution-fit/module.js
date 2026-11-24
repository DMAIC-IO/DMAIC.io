/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'distribution-fit',
  version: '2.0.0',
  icon: 'module.distribution-fit',
  phase: 'analyze',
  group: 'statistics',
  uses: ['worksheet'],
  cycles: {
    dmaic: { phase: 'analyze' },
    dmadv: { phase: 'analyze' },
    eightd: { phase: 'rootcause' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
