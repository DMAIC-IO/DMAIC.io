/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'resampling',
  version: '2.0.0',
  icon: 'module.resampling',
  phase: 'analyze',
  group: 'statistics',
  uses: ['worksheet'],
  cycles: {
    dmaic: { phase: 'analyze', allowedPhases: ['analyze', 'improve'] },
    dmadv: { phase: 'analyze', allowedPhases: ['analyze', 'verify'] },
    eightd: { phase: 'rootcause', allowedPhases: ['rootcause', 'implementation'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
