/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'activity-flowchart',
  version: '1.0.0',
  icon: 'module.activity-flowchart',
  phase: 'analyze',
  group: 'flowcharts',
  cycles: {
    dmaic: { phase: 'analyze' },
    dmadv: { phase: 'analyze' },
    eightd: { phase: 'rootcause' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
