/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'outlier-test',
  version: '2.0.0',
  icon: 'module.outlier-test',
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
