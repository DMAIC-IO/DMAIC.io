/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'attribute-test',
  version: '1.1.0',
  icon: 'module.attribute-test',
  phase: 'analyze',
  group: 'statistics',
  uses: ['worksheet'],
  cycles: {
    dmaic: { phase: 'analyze' },
    dmadv: { phase: 'analyze', allowedPhases: ['analyze', 'verify'] },
    eightd: { phase: 'rootcause', allowedPhases: ['rootcause', 'implementation'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
