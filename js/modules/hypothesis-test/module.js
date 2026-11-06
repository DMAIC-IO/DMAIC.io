/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'hypothesis-test',
  version: '1.2.0',
  icon: 'module.hypothesis-test',
  phase: 'analyze',
  group: 'statistics',
  cycles: {
    dmaic: { phase: 'analyze' },
    dmadv: { phase: 'analyze', allowedPhases: ['analyze', 'verify'] },
    eightd: { phase: 'rootcause', allowedPhases: ['rootcause', 'implementation'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
