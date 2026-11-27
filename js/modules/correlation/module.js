/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'correlation',
  version: '1.1.0',
  icon: 'module.correlation',
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
