/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'deployment-flowchart',
  version: '1.0.0',
  icon: 'module.deployment-flowchart',
  phase: 'analyze',
  group: 'flowcharts',
  cycles: {
    dmaic: { phase: 'analyze' },
    dmadv: { phase: 'analyze' },
    eightd: { phase: 'rootcause' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
