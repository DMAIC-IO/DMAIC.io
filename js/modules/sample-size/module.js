/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'sample-size',
  version: '1.1.0',
  icon: 'module.sample-size',
  phase: 'analyze',
  group: 'statistics',
  cycles: {
    dmaic: { phase: 'analyze' },
    dmadv: { phase: 'analyze' },
    eightd: { phase: 'rootcause' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
